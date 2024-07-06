# ************************************************************************************************************
# Provides a wrapper for the two Few-shot methods: prediction and fine-tuning. Contains the following logic:
# * called by the run_gpu_python_code.php (or its local counterpart: run_gpu_python_code_local.php),
# * checks if GPU is available, excludes "frozen" boxes from the image processing,
# * converts data (box and transcription) to the input format of Few shot,
# * calls either Few shot prediction (CPU or GPU) or training (only GPU),
# * converts Few shot output data back to TranscriptTool's format,
# * saves output data into files.
#
# The original version of the code (https://github.com/dali92002/HTRbyMatching) inside the "few_shot_train" folder 
# was written by the authors (in particular by Mohamed Ali Souibgui) of the paper "Towards a Generic Unsupervised
# Method for Transcription of Encoded Manuscripts" (https://doi.org/10.48550/arXiv.2009.12577). The code
# was kindly provided by Mohamed Ali Souibgui and was adapted to work with the TranscriptTool.
# 
# ************************************************************************************************************

import os
import json
import argparse
import random
import PIL
import torch
from PIL import Image
import math
import time
import subprocess

import sys
import logging
logger = logging.getLogger(__name__)
handler = logging.StreamHandler(stream=sys.stdout)
logger.addHandler(handler)

# Setting up logging of exceptions to the log file
def handle_exception(exc_type, exc_value, exc_traceback):
    if issubclass(exc_type, KeyboardInterrupt):
        sys.__excepthook__(exc_type, exc_value, exc_traceback)
        return

    logger.error("Uncaught exception", exc_info=(exc_type, exc_value, exc_traceback))

sys.excepthook = handle_exception

# ! this config is duplicated elsewhere in the code
FLOAT_PRECISION = 3

def get_gpu_memory_map():
    # https://discuss.pytorch.org/t/access-gpu-memory-usage-in-pytorch/3192/3
    """Get the current gpu usage.

    Returns
    -------
    usage: dict
        Keys are device ids as integers.
        Values are memory usage as integers in MB.
    """
    
    try:
        result = subprocess.check_output(
            [
                'nvidia-smi', '--query-gpu=memory.used',
                '--format=csv,nounits,noheader'
            ], encoding='utf-8')
    except:
        # ! In case if the above command fails (like with "Failed to initialize NVML: Driver/library version mismatch"),
        # ! we make sure that the GPU in this case will not be used, by setting the used memory to maximum.
        result = "4000" # TODO: change if GPU has a different memory size.

    # Convert lines into a dictionary
    gpu_memory = [int(x) for x in result.strip().split('\n')]
    gpu_memory_map = dict(zip(range(len(gpu_memory)), gpu_memory))
    return gpu_memory_map


def identify_active_lines_and_symbols(dict_of_lines, list_of_symbols, accumulated_log_text, REQUIRED_AREA_OVERLAP_BETWEEN_SYMBOL_AND_LINE = .7):

    """Identifies which lines have any symbols inside them and which symbols are not contained in any line. This function
    only considers lines and symbols on the same image, and as such uses relative coordinates (0..1).

    Parameters
    ----------
    dict_of_lines : dict
        The lines (each as a dict with coordinates) as a dict with unique id-s as keys.
    list_of_symbols : list
        The available symbols (each as a dict with coordinates and a cluster_id) as a list.
    REQUIRED_AREA_OVERLAP_BETWEEN_SYMBOL_AND_LINE : float, optional
        Specifies the minimum required overlap between the areas of lines and symbols in order to consider them intersecting.

    Returns
    -------
    dict_of_active_lines : dict
        The lines (each as a dict with coordinates) which have any symbols contained in them as a dict with unique id-s as keys (same format as the corresponding input).
    list_of_active_symbols : list
        The symbols (each as a dict with coordinates and a cluster_id) which are contained in any line as a list (same format as the corresponding input).
    
    """

    dict_of_active_lines = {}
    list_of_active_symbols = []

    for i, symbol in enumerate(list_of_symbols): 

        active_symbol_flag = False

        for key_j, line in dict_of_lines.items():

            # bottom left corner
            bottom = min(line["top"] + line["height"], symbol["top"] + symbol["height"])
            left = max(line["left"], symbol["left"])
            # top right corner
            top = max(line["top"], symbol["top"])
            right = min(line["left"] + line["width"], symbol["left"] + symbol["width"])

            area_of_intersection = max(bottom - top, 0) * max(right - left, 0) / (symbol["height"] * symbol["width"])

            # if symbol is not contained in any line, then we skip it
            # ! if symbol is inside multiple lines, this code will take the first of those and will disregard any other
            if area_of_intersection > REQUIRED_AREA_OVERLAP_BETWEEN_SYMBOL_AND_LINE:
                symbol["parent_line"] = key_j
                list_of_active_symbols.append(symbol)
                active_symbol_flag = True

                if key_j not in dict_of_active_lines:
                    dict_of_active_lines[key_j] = line

                break

        if not active_symbol_flag:
            accumulated_log_text += f"symbol not contained in any line: {symbol}\n"

    return dict_of_active_lines, list_of_active_symbols, accumulated_log_text


def append_to_filename(file_path, addition):
    """
    Appends the given addition to the filename in the provided file path.

    Args:
        file_path (str): The path of the file.
        addition (str): The string to append to the filename.

    Returns:
        str: The modified file path with the addition appended to the filename.
    """

    root, ext = os.path.splitext(file_path)

    return f"{root}{addition}{ext}"


def run_few_shot_test(current_code, additional_arguments, WORKING_DIR_PATH, LOG_PATH, session_id, BASE_MODELS_WITH_RESIZING,
                        bounding_boxes_json, transcription_json, generated_transcription_json, device):
    """
    Runs the Few-shot prediction algorithm. First converts the input lines from the bounding_boxes_json format to
    the format (as images inside folders) required by the Few-shot code. Then runs the Few-shot code and converts the output back to the
    bounding_boxes_json format.

    Args:
        current_code (object): points to the Few-shot prediction code.
        additional_arguments (dict): Additional arguments for the execution.
        WORKING_DIR_PATH (str): The path to the working directory.
        LOG_PATH (str): The path to the log file.
        session_id (str): The unique session ID.
        BASE_MODELS_WITH_RESIZING (list): List of base models with the new resizing. Currently: "cipherglot-mix" and "cipherglot-separated".
        bounding_boxes_json (dict): Contains the information on images and boxes with cluster_id.
        transcription_json (dict): Contains the cluster_id to transcription mapping.
        generated_transcription_json (dict): The existing or previously predicted line-by-line transcription stored as json.
        device (str): The device to run the test on: CPU or GPU.
    """

    SHOTS = additional_arguments["current_execution"]["numberOfShots"]
    THRESHOLD = additional_arguments["current_execution"]["thresholdFewShots"]
    READ_SPACES = additional_arguments["current_execution"]["fewShotReadSpacesBool"]
    CIPHER = additional_arguments["current_execution"]["selectedAlphabetFewShots"]
    MODEL = additional_arguments["current_execution"]["selectedModelFewShots"]

    ALPHABET_PATH = "alphabet"
    DATA_PATH = f"{WORKING_DIR_PATH}/{session_id}"
    CIPHER_PATH = f"{DATA_PATH}/{CIPHER}"
    MODEL_PATH = f"../user_models/{MODEL}.pth"

    RESIZING_FLAG = True if ("RESIZE_FLAG" in MODEL or MODEL in BASE_MODELS_WITH_RESIZING) else False

    os.mkdir(DATA_PATH, 0o770)
    os.mkdir(CIPHER_PATH, 0o770)
    
    # we only use the OLD_RESIZING_FACTOR if we do not have the new resizing (RESIZING_FLAG)
    OLD_RESIZING_FACTOR = 1

    if not RESIZING_FLAG:
        if CIPHER == 'borg':
            OLD_RESIZING_FACTOR = 2.1
        elif CIPHER == 'copiale':
            OLD_RESIZING_FACTOR = 1.5
        elif CIPHER == 'runic':
            OLD_RESIZING_FACTOR = 1.7
        elif CIPHER == 'vatican':
            OLD_RESIZING_FACTOR = 1
        else:
            OLD_RESIZING_FACTOR = 1


    dict_of_lines = {} # use this later to reconstruct the lines and construct the boxes in them

    if "lines" in bounding_boxes_json and len(bounding_boxes_json["lines"]) == 0:
        bounding_boxes_json["lines"] = {}
    
    for i, (image_name, current_image_boxes) in enumerate(bounding_boxes_json["documents"].items()):
        
        image = Image.open(os.path.join(WORKING_DIR_PATH, f'{session_id}-{image_name}')).convert("RGB") # load image
        width, height = image.size

        dict_of_lines[image_name] = {
            "name_index": f"image_{i}",
            "image_width": width,
            "image_height": height,
            "lines": {}
        }

        # Count the order_of_magnitude of the number of lines so that later a correct ordering based on file names would be possible.
        order_of_magnitude = math.floor(math.log10(len(current_image_boxes))) if len(current_image_boxes) != 0 else 0 
        current_image_boxes.sort(key=lambda x: x["top"]) # to make sure that the lines are in the correct order from top to bottom

        for j, current_line in enumerate(current_image_boxes):
            pixel_top = int(current_line["top"] * height)
            pixel_left = int(current_line["left"] * width)
            pixel_width = int(current_line["width"] * width)
            pixel_height = int(current_line["height"] * height)

            if "cluster_id" in current_line:
                del current_line["cluster_id"]

            # If the "image_name" entry is missing, then initialize it before appending to it.
            if image_name not in bounding_boxes_json["lines"]:
                bounding_boxes_json["lines"][image_name] = []

            old_line_indices_to_remove = []

            # Remove old lines which intersect with the new line.
            # Note that non-colliding lines will not be removed even if they are not anymore present on the image.
            for old_line_i, old_line in enumerate(bounding_boxes_json["lines"][image_name]):
                # bottom left corner
                bottom = min(current_line["top"] + current_line["height"], old_line["top"] + old_line["height"])
                left = max(current_line["left"], old_line["left"])
                # top right corner
                top = max(current_line["top"], old_line["top"])
                right = min(current_line["left"] + current_line["width"], old_line["left"] + old_line["width"])

                smaller_area = old_line["height"] * old_line["width"] if old_line["height"] * old_line["width"] < current_line["height"] * current_line["width"] else current_line["height"] * current_line["width"]
                area_of_intersection = max(bottom - top, 0) * max(right - left, 0) / smaller_area

                # if new line intersects with an old line, then we mark the old line for removal
                if area_of_intersection > 0.7:
                    old_line_indices_to_remove.append(old_line_i)

            # remove marked lines
            bounding_boxes_json["lines"][image_name] = [line for line_index, line in enumerate(bounding_boxes_json["lines"][image_name]) if line_index not in old_line_indices_to_remove]

            # finally, add new line
            bounding_boxes_json["lines"][image_name].append(current_line)

            order_of_magnitude_current_j = math.floor(math.log10(j)) if j != 0 else 0 

            if order_of_magnitude_current_j == order_of_magnitude: # "order_of_magnitude" cannot be smaller than "order_of_magnitude_current_j"
                corrected_by_order_of_magnitude = j
            else:
                corrected_by_order_of_magnitude = (order_of_magnitude - order_of_magnitude_current_j) * "0" + str(j)

            unique_symbol_identifier = f"name_{i}_{corrected_by_order_of_magnitude}.jpg"

            cropped_out_line = image.crop((pixel_left, pixel_top, pixel_left + pixel_width,  pixel_top + pixel_height))
            # Note: only works on older pillow (8.4) -> PIL.Image.BILINEAR, on newer pillow use -> PIL.Image.Resampling.BILINEAR
            resized_line = cropped_out_line.resize((int(pixel_width*OLD_RESIZING_FACTOR), 105), resample=PIL.Image.BILINEAR)  # fixed height of 105
            
            resized_line.save(f"{CIPHER_PATH}/{unique_symbol_identifier}")

            dict_of_lines[image_name]["lines"][unique_symbol_identifier] = {
                "top": current_line["top"],
                "left": current_line["left"],
                "width": current_line["width"],
                "height": current_line["height"],
            }

    

    error_message, list_lines, pred_boxes, predictions, pred_lines, fixed_alphabet = current_code.main(
        CIPHER, ALPHABET_PATH, SHOTS, THRESHOLD, READ_SPACES,
        DATA_PATH, MODEL_PATH, LOG_PATH, RESIZING_FLAG,
        device
    )

    # If there was no warning, then we process the output of code by converting back its dataformat to ours.
    if error_message == None:

        # Extend or overwrite transcription.json with the missing cluster_id to transcription mappings, do not change parts which need not to be changed.
        for i, elem in enumerate(fixed_alphabet):
            if str(i) in transcription_json["transcriptions"]:
                if transcription_json["transcriptions"][str(i)]["transcription"] != elem:
                    transcription_json["transcriptions"][str(i)] = {
                        "transcription": elem
                    }
                else:
                    None
            else:
                transcription_json["transcriptions"][str(i)] = {
                    "transcription": elem
                }

        # empty bounding_boxes_json: previously line coordinates were there, now the symbol boxes will take their place
        for img_key in bounding_boxes_json["documents"].keys():
            bounding_boxes_json["documents"][img_key] = [] 


        for img_key in bounding_boxes_json["documents"].keys():
            # Initialize an empty dict for the image if it is not there or is in the old format.
            # No backward compatibility: in the old format there was only a single string with the transcription of the entire page, we just overwrite that.
            if img_key not in generated_transcription_json or (img_key in generated_transcription_json and isinstance(generated_transcription_json.get(img_key), str)):
                generated_transcription_json[img_key] = {}
                generated_transcription_json[img_key]["lines"] = []
                generated_transcription_json[img_key]["page_transcription"] = ""

        # Convert the boxes, clusters, and transcription to our dataformat.
        for line_name, boxes_in_line, clusters_in_line, transcribed_symbols in zip(list_lines, pred_boxes, predictions, pred_lines):

            # identify parent image of line
            parent_image_key = None

            for image_key in dict_of_lines.keys():
                if line_name in dict_of_lines[image_key]["lines"]:
                    parent_image_key = image_key
                    break

            parent_image = dict_of_lines[parent_image_key]
            parent_image_width = parent_image["image_width"]
            parent_image_height = parent_image["image_height"]

            current_line = parent_image["lines"][line_name]

            old_lines_to_remove = []


            # Update generated_transcription_json, check by coordinates if line is already there: if yes, then mark it for removal.
            # Note that non-colliding lines will not be removed even if they are not anymore present on the image.
            for old_line_index, old_line in enumerate(generated_transcription_json[parent_image_key]["lines"]):
                # bottom left corner
                bottom = min(current_line["top"] + current_line["height"], old_line["top"] + old_line["height"])
                left = max(current_line["left"], old_line["left"])
                # top right corner
                top = max(current_line["top"], old_line["top"])
                right = min(current_line["left"] + current_line["width"], old_line["left"] + old_line["width"])

                smaller_area = old_line["height"] * old_line["width"] if old_line["height"] * old_line["width"] < current_line["height"] * current_line["width"] else current_line["height"] * current_line["width"]
                area_of_intersection = max(bottom - top, 0) * max(right - left, 0) / smaller_area

                # if new line intersects with an old line, then we mark the old line for removal
                if area_of_intersection > 0.7:
                    old_lines_to_remove.append(old_line_index)

            # remove marked lines
            generated_transcription_json[parent_image_key]["lines"] = [line for line_index, line in enumerate(generated_transcription_json[parent_image_key]["lines"]) if line_index not in old_lines_to_remove]

            # add new line
            current_line["line_transcription"] = transcribed_symbols
            generated_transcription_json[parent_image_key]["lines"].append(current_line)
            
            # Iterate over the cluster_id-s.
            for i, cluster_id in enumerate(clusters_in_line):

                # Depending on which resizing (old or new) the model uses, we transform the box coordinates accordingly.
                # "2*i" and "2*i+1" is because the coords are packed into a simple list
                if RESIZING_FLAG:
                    left_coord = boxes_in_line[2*i] * current_line["width"] * parent_image_width / 2048 
                    right_coord = boxes_in_line[2*i+1] * current_line["width"] * parent_image_width / 2048
                else:
                    left_coord = boxes_in_line[2*i] / OLD_RESIZING_FACTOR
                    right_coord = boxes_in_line[2*i+1] / OLD_RESIZING_FACTOR

                symbol_dict = {
                    "cluster_id": str(int(cluster_id)), # undefined cluster_id = -2, SPACE cluster_id = -1
                    "left": current_line["left"] + round(left_coord / parent_image_width, FLOAT_PRECISION), 
                    "top": round(current_line["top"], FLOAT_PRECISION), # we only get a prediction in the horizontal direction
                    "width": round((right_coord - left_coord) / parent_image_width, FLOAT_PRECISION), 
                    "height": round(current_line["height"], FLOAT_PRECISION), # we only get a prediction in the horizontal direction
                }

                bounding_boxes_json["documents"][parent_image_key].append(symbol_dict)


        # On each page: order from top to bottom the lines and create a single transcription string for each image: this makes it easy to export it on the front end. 
        for img_key in bounding_boxes_json["documents"].keys():
            if img_key in generated_transcription_json:
                generated_transcription_json[img_key]["page_transcription"] = "" # clear out previous version of transcription
                generated_transcription_json[img_key]["lines"].sort(key=lambda x: x["top"])
                for line_to_accumulate in generated_transcription_json[img_key]["lines"]:
                    generated_transcription_json[img_key]["page_transcription"] += line_to_accumulate["line_transcription"] + "\n"

    return error_message, bounding_boxes_json, transcription_json, generated_transcription_json


def run_few_shot_train(current_code, additional_arguments, WORKING_DIR_PATH, LOG_PATH, session_id, BASE_MODELS_FOR_FINE_TUNING,
                        bounding_boxes_json, transcription_json, device, lookup_table):
    
    """
    Runs the Few-shot fine-tuning algorithm. First converts the input data from the bounding_boxes_json format to
    the format (as images inside folders) required by the Few-shot code. Then runs the Few-shot code and saves the
    trained model weights.

    Args:
        current_code (object): points to the Few-shot fine-tuning code.
        additional_arguments (dict): Additional arguments for the execution.
        WORKING_DIR_PATH (str): The path to the working directory.
        LOG_PATH (str): The path to the log file.
        session_id (str): The unique session ID.
        BASE_MODELS_FOR_FINE_TUNING (list): List of base models enabled for fine-tuning. Currently: "omniglot", "cipherglot-mix", and "cipherglot-separated".
        bounding_boxes_json (dict): Contains the information on images and boxes with cluster_id.
        transcription_json (dict): Contains the cluster_id to transcription mapping.
        device (str): The device to run the test on: this must be GPU!
        lookup_table (dict): the lookup table of the save. Used here to store the resulting character error rate logs in it.
    """

    USER_VALIDATION_FLAG = additional_arguments["current_execution"]["user_validation_flag"]
    CIPHER = additional_arguments["current_execution"]["selectedAlphabetFewShots"]
    EPOCHS = additional_arguments["current_execution"]["few_shot_train_epochs"]
    SHOTS = additional_arguments["current_execution"]["numberOfShots"]
    THRESHOLD = additional_arguments["current_execution"]["thresholdFewShots"]
    MODEL = additional_arguments["current_execution"]["selectedModelFewShots"] # existing model which will be fine-tuned
    NEW_MODEL = additional_arguments["current_execution"]["new_model_key"]
    BATCH_SIZE = 3
    TRAIN_TYPE = "fine_tune" # there is currently no other option here

    RESIZING_FLAG = True if "RESIZE_FLAG" in NEW_MODEL else False

    ALPHABET_PATH = "alphabet"
    DATA_PATH = f"{WORKING_DIR_PATH}/{session_id}"
    VALIDATION_DATA_PATH = DATA_PATH # validation data in the same folder as training data
    VALIDATION_GT_PATH = f"{VALIDATION_DATA_PATH}/gt/{CIPHER}"
    VALIDATION_LINES_PATH = f"{VALIDATION_DATA_PATH}/lines/{CIPHER}"
    
    MODEL_PATH = f"../user_models/{MODEL}.pth"
    if MODEL in BASE_MODELS_FOR_FINE_TUNING:
        NEW_MODEL_PATH = f"../user_models/{NEW_MODEL}.pth"
    else:
        NEW_MODEL_PATH = MODEL_PATH
    
    # check whether on "NEW_MODEL_PATH" already a file exists, throw error if yes
    if os.path.isfile(NEW_MODEL_PATH):
        raise ValueError("****attempted to create new model on a path where a file already exists")

    # transform input data to the right format

    # let the code fail if the folders already exist, we do not want to overwrite anything
    os.mkdir(DATA_PATH, 0o770)
    os.mkdir(f"{DATA_PATH}/gt", 0o770)
    os.mkdir(VALIDATION_GT_PATH, 0o770)
    os.mkdir(f"{DATA_PATH}/lines", 0o770)
    os.mkdir(VALIDATION_LINES_PATH, 0o770)

    # we only use the old resizing_factor if we do not have the new resizing (RESIZING_FLAG)
    OLD_RESIZING_FACTOR = 1

    if not RESIZING_FLAG:
        if CIPHER == 'borg':
            OLD_RESIZING_FACTOR = 2.1
        elif CIPHER == 'copiale':
            OLD_RESIZING_FACTOR = 1.5
        elif CIPHER == 'runic':
            OLD_RESIZING_FACTOR = 1.7
        elif CIPHER == 'vatican':
            OLD_RESIZING_FACTOR = 1
        else:
            OLD_RESIZING_FACTOR = 1

    REQUIRED_AREA_OVERLAP_BETWEEN_SYMBOL_AND_LINE = 0.7
    VALIDATION_SET_SIZE = 0.2
    
    selected_alphabet_symbols = os.listdir(os.path.join("few_shot_train", ALPHABET_PATH, CIPHER)) # <SPACE> is not used in the training
    training_txt = ""
    validation_set = {}

    for i, (image_name, current_image_boxes) in enumerate(bounding_boxes_json["documents"].items()):

        # load image 
        image = Image.open(os.path.join(WORKING_DIR_PATH, f'{session_id}-{image_name}')).convert("RGB")
        width, height = image.size

        accumulated_log_text = ""

        # If the "image_name" entry is missing, then initialize it before appending to it.
        if image_name not in bounding_boxes_json["lines"]:
            bounding_boxes_json["lines"][image_name] = []

        # convert list into dict with unique keys
        dict_of_lines = {f"name_{i}_{j}" : x for j, x in enumerate(bounding_boxes_json["lines"][image_name])}

        dict_of_active_lines, list_of_active_symbols, accumulated_log_text = identify_active_lines_and_symbols(
                dict_of_lines, bounding_boxes_json["documents"][image_name], accumulated_log_text,
                REQUIRED_AREA_OVERLAP_BETWEEN_SYMBOL_AND_LINE
        )

        active_line_ratio = len(dict_of_active_lines)/len(dict_of_lines) if len(dict_of_lines) > 0 else -1 # "-1" to signify that there was no input and this ratio in this case does not make sense
        active_symbol_ratio = len(list_of_active_symbols)/len(bounding_boxes_json["documents"][image_name]) if len(bounding_boxes_json["documents"][image_name]) > 0 else -1 # "-1" to signify that there was no input and this ratio in this case does not make sense

        with open(LOG_PATH,"a") as log_file:
            log_file.write("image = {}, active line ratio = {:.0%}, active symbol ratio = {:.0%}\n".format(image_name, active_line_ratio, active_symbol_ratio))

        # only put lines into validation set if there are more than one 
        if len(dict_of_active_lines) > 1 and USER_VALIDATION_FLAG:
            # establish the "VALIDATION_SET_SIZE" percent lines randomly as validation set
            validation_last_index = int(len(dict_of_active_lines) * VALIDATION_SET_SIZE) - 1
            # if there are less than 5 lines, then still have one line as validation (even if it is more than what is specified by VALIDATION_SET_SIZE)
            validation_last_index = validation_last_index if validation_last_index >= 0 else 0
            shuffled_line_keys = list(dict_of_active_lines.keys())
            random.shuffle(shuffled_line_keys)
            validation_set.update({x : "" for j, x in enumerate(shuffled_line_keys) if j <= validation_last_index})
            
        else:
            # possible enhancements: throw error or warning in frontend logs if there are less than one line in an image
            None 

        count_symbols_in_training = 0
        

        # save lines to root folder
        for key_j, line in dict_of_active_lines.items():

            pixel_top = int(line["top"] * height)
            pixel_left = int(line["left"] * width)
            pixel_width = int(line["width"] * width)
            pixel_height = int(line["height"] * height)

            cropped_out_line = image.crop((pixel_left, pixel_top, pixel_left + pixel_width,  pixel_top + pixel_height))
            # Note: only works on older pillow (8.4) -> PIL.Image.BILINEAR, on newer pillow use -> PIL.Image.Resampling.BILINEAR
            resized_line = cropped_out_line.resize((int(pixel_width*OLD_RESIZING_FACTOR), 105), resample=Image.BILINEAR)  # fixed height of 105

            if key_j in validation_set:
                resized_line.save(f"{VALIDATION_LINES_PATH}/{key_j}.jpg")
            else:
                resized_line.save(f"{DATA_PATH}/{key_j}.jpg")

        for j, symbol in enumerate(list_of_active_symbols):

            # find parent line
            if symbol["parent_line"] in dict_of_active_lines:
                parent_line = dict_of_active_lines[symbol["parent_line"]]
            else:
                accumulated_log_text += f"no parent line: {symbol}\n"
                continue

            # get transcription
            # if no cluster_id, then the symbol is skipped
            if "cluster_id" in symbol:
                cluster_id = str(symbol["cluster_id"])
            else:
                accumulated_log_text += f"no cluster_id: {symbol}\n"
                continue

            # if cluster_id is not in the transcription.json, then the symbol is skipped
            if cluster_id in transcription_json["transcriptions"]:
                symbol_tr = transcription_json["transcriptions"][cluster_id]["transcription"]
            else:
                accumulated_log_text += f"cluster_id not in transcription.json: {symbol}\n"
                continue

            # whitelisting transcriptions
            if symbol_tr in selected_alphabet_symbols:

                if symbol["parent_line"] in validation_set:
                    validation_set[symbol["parent_line"]] += f"{symbol_tr} "
                    accumulated_log_text += f"queued for validation: {symbol}\n"
                else:
                    symbol_in_line_left = int(max(symbol["left"] - parent_line["left"], 0) * width * OLD_RESIZING_FACTOR)
                    symbol_in_line_right = int(max(symbol["left"] + symbol["width"] - parent_line["left"], 0) * width * OLD_RESIZING_FACTOR)

                    # If symbol has zero width, then skip it. It would cause the loss to be "nan" if left in.
                    if symbol_in_line_left == symbol_in_line_right:
                        accumulated_log_text += f"zero width: {symbol}\n"
                        continue

                    symbol_in_line_top = 0
                    symbol_in_line_bottom = 105

                    path_to_image = os.path.join(DATA_PATH, f"{symbol['parent_line']}.jpg")
                    training_txt += f"{path_to_image},{symbol_in_line_left},{symbol_in_line_top},{symbol_in_line_right},{symbol_in_line_bottom},{symbol_tr}\n"
                    count_symbols_in_training += 1
            else:
                accumulated_log_text += f"not in alphabet: {symbol} with transcription: {symbol_tr}\n"
                
        training_symbol_ratio = count_symbols_in_training/len(list_of_active_symbols) if len(list_of_active_symbols) > 0 else -1 # "-1" to signify that there was no input and this ratio in this case does not make sense
        with open(LOG_PATH,"a") as log_file:
            log_file.write(accumulated_log_text)
            log_file.write("training symbol ratio = {:.0%}\n".format(training_symbol_ratio))

    # throw error if "training_txt" is empty
    if training_txt == "":
        print("------------------------------------------------- session_id: ", session_id)
        raise ValueError("******************** training_txt is an empty string")

    # save train.txt into the specified folder
    if not os.path.isdir(f"{DATA_PATH}/annotation"):
        os.mkdir(f"{DATA_PATH}/annotation", 0o770)
    with open(f"{DATA_PATH}/annotation/train.txt", 'w') as train_file:
        train_file.write(training_txt)

    # save validation txt-s into their specified folder
    for key, txt in validation_set.items():
        with open(f"{VALIDATION_GT_PATH}/{key}.txt", 'w') as val_txt:
            val_txt.write(txt)

    error_message, lookup_table = current_code.main(
        USER_VALIDATION_FLAG, RESIZING_FLAG,
        CIPHER, ALPHABET_PATH, BATCH_SIZE, SHOTS, THRESHOLD, TRAIN_TYPE,
        DATA_PATH, VALIDATION_DATA_PATH, EPOCHS,
        MODEL_PATH, NEW_MODEL_PATH,
        LOG_PATH, lookup_table, device
    )


    return error_message, lookup_table


def main():

    # ! change working dir to the one containing this code
    os.chdir(os.path.dirname(__file__))
    
    parser = argparse.ArgumentParser()
    parser.add_argument('--code', type=str, help='target python code', required=True)
    parser.add_argument('--sessionID', type=str, help='unique session identifier', required=True)
    parser.add_argument('--parameters', type=str, help='path to execution_parameters.json', required=True)
    parser.add_argument('--success_flag', type=str, help='path to success_flag_file.json', required=True)
    parser.add_argument('--lookup_table', type=str, help='path to lookup_table.json', required=True)
    parser.add_argument('--boxes', type=str, help='path to bounding_boxes.json', required=True)
    parser.add_argument('--transcription', type=str, help='path to transcription.json', required=True)
    parser.add_argument('--generated_transcription', type=str, help='path to generated_transcription.json', required=True)
    parser.add_argument('--working_dir', type=str, help='path to working directory', required=True) # where input/output files are/will be located
    parser.add_argument('--suffix', type=str, help='suffix appended to the end of output file names', required=True)

    args = parser.parse_args()

    current_code = None
    minimum_required_gpu_memory = 0

    if args.code == "test_few_shot.py":
        import few_shot_train.test as few_shot_test
        current_code = few_shot_test
        minimum_required_gpu_memory = 2000 # TODO: change according to your GPU
    elif args.code == "train_few_shot.py":
        import few_shot_train.train as few_shot_train
        current_code = few_shot_train
        minimum_required_gpu_memory = 3700 # TODO: change according to your GPU
    else:
        raise ValueError("invalid target code")
    

    bounding_boxes_json_path = args.boxes
    out_bounding_boxes_json_path = append_to_filename(bounding_boxes_json_path, args.suffix)

    transcription_json_path = args.transcription
    out_transcription_json_path = append_to_filename(transcription_json_path, args.suffix)

    generated_transcription_json_path = args.generated_transcription
    out_generated_transcription_json_path = append_to_filename(generated_transcription_json_path, args.suffix)

    lookup_table_json_path = args.lookup_table
    out_lookup_table_json_path = append_to_filename(lookup_table_json_path, args.suffix)

    success_flag_json_path = args.success_flag

    with open(bounding_boxes_json_path, "r") as f:
        bounding_boxes_json = json.load(f)

    with open(transcription_json_path, "r") as f:
        transcription_json = json.load(f)

    if os.path.isfile(generated_transcription_json_path):
        with open(generated_transcription_json_path, "r") as f:
            generated_transcription_json = json.load(f)
    else:
        generated_transcription_json = {}

    with open(args.parameters, "r") as f:
        execution_parameters = json.load(f)

    with open(lookup_table_json_path, "r") as f:
        lookup_table = json.load(f)   

    additional_arguments = {
        "current_execution": execution_parameters,
    }

    session_id = args.sessionID

    WORKING_DIR_PATH = args.working_dir # absolute path

    LOG_PATH = os.path.join(WORKING_DIR_PATH, f"{session_id}-log.txt")
    logging.basicConfig(filename=LOG_PATH)

    BASE_MODELS_WITH_RESIZING = ["cipherglot-mix", "cipherglot-separated"]
    BASE_MODELS_FOR_FINE_TUNING = execution_parameters["base_models"]

    error_message = None

    # check gpu memory availability
    device = torch.device('cuda') if torch.cuda.is_available() else torch.device('cpu')

    free_memory_MB = 0
    total_memory_MB = 0

    if device == torch.device('cuda'):
        total_memory = torch.cuda.get_device_properties(device).total_memory
        total_memory_MB = total_memory / 1024 / 1024
        # ! there is a problem if the memory is read when another run is only yet "winding up" and will use more memory in a few seconds
        # overall this seems like a risky business: to run multiple processes on a single gpu; this check is not a reliable way to avoid collisions
        memory_in_use_MB = get_gpu_memory_map()
        free_memory_MB = total_memory_MB - memory_in_use_MB[0] # applicable for a single GPU!

    # switch to cpu if gpu is not available (or out of memory)
    if not (free_memory_MB > minimum_required_gpu_memory and device == torch.device('cuda')):
        device = torch.device('cpu')

    # remove and save away "frozen" boxes
    # ! duplicate in image_proc_wrapper
    frozen_boxes = {}
    temp_bounding_boxes_json = bounding_boxes_json

    for key, img in temp_bounding_boxes_json["documents"].items():

        frozen_boxes[key] = []
        bounding_boxes_json["documents"][key] = []

        for j, box in enumerate(img):

            if "frozen" in box:
                frozen_boxes[key].append(box)
            else:
                bounding_boxes_json["documents"][key].append(box)


    if args.code == "test_few_shot.py":

        error_message, bounding_boxes_json, transcription_json, generated_transcription_json = run_few_shot_test(current_code,
                                        additional_arguments, WORKING_DIR_PATH, LOG_PATH, session_id, BASE_MODELS_WITH_RESIZING,
                                        bounding_boxes_json, transcription_json, generated_transcription_json, device)

            
    elif args.code == "train_few_shot.py":
            
        # we cannot train on CPU since the trained models will not be usable later
        if device != torch.device('cuda'):
            raise ValueError("****no GPU available for training, exiting...")
        else:
            error_message, lookup_table = run_few_shot_train(current_code, additional_arguments, WORKING_DIR_PATH, LOG_PATH, session_id,
                                                            BASE_MODELS_FOR_FINE_TUNING,
                        bounding_boxes_json, transcription_json, device, lookup_table)


    # add "frozen" boxes back to bounding_boxes_json
    # ! duplicate in image_proc_wrapper
    for key, img in frozen_boxes.items():

        for j, box in enumerate(img):

            bounding_boxes_json["documents"][key].append(box)

    # ! change again working dir to the one containing this code, as we changed it in the Few-shot codes as well
    os.chdir(os.path.dirname(__file__))

    # handle errors of called python code
    if error_message != None:
        print(error_message)
        print("------------------------------------------------- session_id: ", session_id)
        with open(LOG_PATH,"a") as file:
            file.write('{}\nError: {}\n------------------------------------------------- session_id: {} \n'.format(time.strftime("%Y.%m.%d-%H.%M.%S"), error_message, session_id))
        raise ValueError("error in image processing module")
    # only overwrite json files if there was no error
    else:
        with open(out_bounding_boxes_json_path, "w") as f:
            json.dump(bounding_boxes_json, f)

        with open(out_transcription_json_path, "w") as f:
            json.dump(transcription_json, f)

        with open(out_generated_transcription_json_path, "w") as f:
            json.dump(generated_transcription_json, f)

        # Change 0 to 1 (in the "run_gpu_python_code.php" the appropriate entry was set to 0) to indicate that the finished code ran through successfully.
        if args.code == "test_few_shot.py":
            lookup_table["GPU_server_result_transmission"]["few_shot_recognition"]["finished"] = 1

        elif args.code == "train_few_shot.py":
            lookup_table["GPU_server_result_transmission"]["few_shot_training"]["finished"] = 1

        else: # Not handled here, already handled above the case of incorrect code call.
            None

        with open(out_lookup_table_json_path, "w") as f:
            json.dump(lookup_table, f)

        # flag to show if the image processing was successful or not (1=success, 0=failure)
        success_flag_json = None

        with open(success_flag_json_path, "r") as f:
            success_flag_json = json.load(f)

        success_flag_json["image_processing_success"] = 1

        with open(success_flag_json_path, "w") as f:
            json.dump(success_flag_json, f)

if __name__ == "__main__":
    main()
