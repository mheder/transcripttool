# ************************************************************************************************************
# Performs label propagation the existing symbols in the bounding_boxes.json. This could improve the
# quality of the existing clustering. Takes as input the bounding_boxes.json and returns it with
# an updated cluster_id for each symbol.
#
# The original version of this code was written by the authors of the paper "Towards a Generic Unsupervised
# Method for Transcription of Encoded Manuscripts" (https://doi.org/10.1145/3322905.3322920). The code
# was kindly provided by Jialuo Chen and was adapted to work with the TranscriptTool.
# ************************************************************************************************************

import numpy as np
import cv2
import math
from sklearn.semi_supervised import LabelSpreading

import traceback

def nan_equal(a, b):
    try:
        np.testing.assert_equal(a,b)
    except AssertionError:
        return False
    return True

def start_label_propagation(bounding_boxes_json, images_path, alpha, parallel=-1, type_output="probability"):

    if alpha <= 0:
        alpha = 0.01

    if alpha >= 1:
        alpha = 0.99

    crops = {}
    Y_train = []

    for i, (image_name, symbol_list) in enumerate(bounding_boxes_json["documents"].items()):
        
        image = cv2.imread(f'{images_path}/{image_name}', 0) # load it as a grey scale image
        
        height, width = image.shape[:2]
        for j, symbol in enumerate(symbol_list):
            pixel_top = int(symbol["top"] * height)
            pixel_left = int(symbol["left"] * width)
            pixel_width = int(symbol["width"] * width)
            pixel_height = int(symbol["height"] * height)
            unique_symbol_identifier = f"name_{i}_{j}"
            crops[unique_symbol_identifier] = image[pixel_top: pixel_top + pixel_height, pixel_left: pixel_left + pixel_width]
            bounding_boxes_json["documents"][image_name][j]["name"] = unique_symbol_identifier

            if "cluster_id" in symbol:
                Y_train.append(int(symbol["cluster_id"]))
            else:
                Y_train.append(-2) # undefined cluster_id = -2

    numImgs = len(bounding_boxes_json["documents"])

    X_train = []

    num_step_Y = 6
    num_step_X = 8

    sift = cv2.SIFT_create()
    print_num = int(math.sqrt(numImgs))

    while print_num > 100:
        print_num = int(math.sqrt(print_num))

    for boxes in crops.values():

        try:
            step_sizeX = boxes.shape[1]/float(num_step_X)
            step_sizeY = boxes.shape[0]/float(num_step_Y)
        except:
            raise ValueError("no image found")

        start_X = step_sizeX/2.0
        start_Y = step_sizeY/2.0

        kp_area = min(step_sizeX/2.0, step_sizeY/2.0)
        kp = []

        for x in range(num_step_X):
            x = start_X + step_sizeX * x
            for y in range(num_step_Y):
                y = start_Y + step_sizeY * y
                kp.append(cv2.KeyPoint(x, y, kp_area))
    
        _, des = sift.compute(boxes, kp)
    
        des = des.reshape(des.shape[0]*des.shape[1])
    
        X_train.append(des)

    X_train = np.float64(X_train)

    if len(X_train) != len(Y_train):
        raise ValueError("Length error: They must have the same length (num. train & num. labels)")

    neighbors = 11

    lp_model = LabelSpreading(kernel='knn', n_neighbors=neighbors, max_iter=30000, tol=0.0001, alpha=alpha, n_jobs=parallel)

    lp_model.fit(X_train, Y_train)

    # update the cluster_id-s in the bounding_boxes.json
    for image_name, symbol_list in bounding_boxes_json["documents"].items():
        
        for symbol_index, symbol in enumerate(symbol_list):
            index_of_current_element =  list(crops.keys()).index(symbol["name"])
            distribution_prob = np.amax(lp_model.label_distributions_[index_of_current_element])
            if not nan_equal(distribution_prob, np.NaN):
                bounding_boxes_json["documents"][image_name][symbol_index]["cluster_id"] = str(int(lp_model.transduction_[index_of_current_element]))
                if type_output == "probability": # we do not use this probability information in the current version of the code
                    bounding_boxes_json["documents"][image_name][symbol_index]["labelProbability"] = round(float(distribution_prob), 3) 
            else:
                # cluster_id = -1 serves as the SPACE cluster 
                # cluster_id = -2 serves as the undefined cluster 
                bounding_boxes_json["documents"][image_name][symbol_index]["cluster_id"] = "-2"

            del bounding_boxes_json["documents"][image_name][symbol_index]["name"]

    return bounding_boxes_json

def main(bounding_boxes_json, transcription_json, images_path, additional_arguments):

    error_message = None

    try:
        bounding_boxes_json = start_label_propagation(bounding_boxes_json, images_path, alpha=additional_arguments["current_execution"]["alphaLabelPropagation"])
    except:
        error_message = traceback.format_exc()

    # here we do not change the transcription, so we just send it back without changing it
    # this is necessary to make the interfaces of all python codes the same
    return error_message, bounding_boxes_json, transcription_json

if __name__ == "__main__":
    main()