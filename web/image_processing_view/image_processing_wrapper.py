# ************************************************************************************************************
# Provides a wrapper for the four image processing modules which run with CPU: datech_line_segmentation,
# async_segmentation, async_kmeans, and async_label_propagation. Handles "frozen" boxes by removing them
# before processing and adding them back after processing. In such a way, the "frozen" boxes are excluded from
# the processing.
# 
# ************************************************************************************************************

import json
import argparse

# ! this config is duplicated elsewhere in the code
FLOAT_PRECISION = 3

import datech_line_segmentation, async_segmentation, async_kmeans, async_label_propagation

def main():

    parser = argparse.ArgumentParser()
    parser.add_argument('--code', type=str, help='target python code', required=True)
    parser.add_argument('--parameters', type=str, help='path to execution_parameters.json', required=True)
    parser.add_argument('--success_flag', type=str, help='path to success_flag_file.json', required=True)
    parser.add_argument('--lookup_table', type=str, help='path to lookup_table.json', required=True)
    parser.add_argument('--boxes', type=str, help='path to bounding_boxes.json', required=True)
    parser.add_argument('--transcription', type=str, help='path to transcription.json', required=True)
    parser.add_argument('--user_projects', type=str, help='path to user_projects folder', required=True)

    args = parser.parse_args()

    codes = {
        "datech_line_segmentation.py": datech_line_segmentation,
        "async_segmentation.py": async_segmentation,
        "async_kmeans.py": async_kmeans,
        "async_label_propagation.py": async_label_propagation
    }

    with open(args.boxes, "r") as f:
        bounding_boxes_json = json.load(f)

    with open(args.transcription, "r") as f:
        transcription_json = json.load(f)

    with open(args.parameters, "r") as f:
        execution_parameters = json.load(f)

    with open(args.lookup_table, "r") as f:
        lookup_table = json.load(f)

    success_flag_json_path = args.success_flag

    project_id = lookup_table["project_id"]
    save_id = lookup_table["save_id"]

    # remove and save away "frozen" boxes
    # ! duplicated in "gpu_image_processing_wrapper.py"
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


    additional_arguments = {
        "current_execution": execution_parameters
    }

    images_path = f'{args.user_projects}/{project_id}/{save_id}'

    error_message = None

    # execute target python code
    if codes[args.code]:
        error_message, bounding_boxes_json, transcription_json = codes[args.code].main(bounding_boxes_json, transcription_json, images_path, additional_arguments)
    else:
        raise ValueError("invalid target code")


    # add "frozen" boxes back to bounding_boxes_json
    # ! duplicated in "gpu_image_processing_wrapper.py"
    for key, img in frozen_boxes.items():
        for j, box in enumerate(img):
            bounding_boxes_json["documents"][key].append(box)

    # handle errors of executed python code
    if error_message != None:
        print(error_message)
        raise ValueError("error in image processing module")
    # only overwrite json files if there was no error
    else:
        with open(args.boxes, "w") as f:
            json.dump(bounding_boxes_json, f)

        with open(args.transcription, "w") as f:
            json.dump(transcription_json, f)

        # flag to show if the image processing was successful or not (1=success, 0=failure)
        success_flag_json = None

        with open(success_flag_json_path, "r") as f:
            success_flag_json = json.load(f)

        success_flag_json["image_processing_success"] = 1

        with open(success_flag_json_path, "w") as f:
            json.dump(success_flag_json, f)


if __name__ == "__main__":
    main()
