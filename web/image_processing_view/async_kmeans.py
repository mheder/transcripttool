# ************************************************************************************************************
# Clusters the existing symbols in the bounding_boxes.json using the K-means method. Takes as input the
# bounding_boxes.json and returns it with an updated cluster_id for each symbol.
# Please note that it will overwrite any previous clusters in the inputted bounding_boxes_json.
#
# The original version of this code was written by the authors of the paper "Towards a Generic Unsupervised
# Method for Transcription of Encoded Manuscripts" (https://doi.org/10.1145/3322905.3322920). The code
# was kindly provided by Jialuo Chen and was adapted to work with the TranscriptTool.
# ************************************************************************************************************

import math, itertools
import numpy as np
import cv2
from sklearn import cluster
from sklearn.metrics import silhouette_score

# ! added imports
from sklearn.utils._testing import ignore_warnings
from sklearn.exceptions import ConvergenceWarning
import traceback


@ignore_warnings(category=ConvergenceWarning)
def clustering(crops, numImgs, beforeNumImages, finalClusters, n_clusters = 100, level = 1, minImages = 3, debug = False, level_limit = 0):

    sift = cv2.SIFT_create()

    num_step_Y = level + 1
    num_step_X = level + 1

    if num_step_X >= 6:
        num_step_X = 6
    if num_step_Y >= 6:
        num_step_Y = 6
    
    while True:
        descriptors = []
        size_not_equal = False
        size = -1
        for boxes in crops.values():

            step_sizeX = (boxes.shape[1] - 2)/float(num_step_X)
            step_sizeY = (boxes.shape[0] - 2)/float(num_step_Y)

            start_X = step_sizeX/2.0
            start_Y = step_sizeY/2.0

            kp_area = max(start_X, start_Y)

            kp = []
            
            for x in range(num_step_X):
                x = start_X + step_sizeX * x
                for y in range(num_step_Y):
                    y = start_Y + step_sizeY * y
                    kp.append(cv2.KeyPoint(x, y, kp_area))

            _, des = sift.compute(boxes, kp)
            try:
                des = des.reshape(des.shape[0]*des.shape[1])
            except:
                continue
            if size == -1:
                size = len(des)
            else:
                if size != len(des):
                    size_not_equal = True
                    if num_step_X > num_step_Y:
                        num_step_X -= 1
                    elif num_step_X > 1 and num_step_Y > 1:
                        num_step_X -= 1
                        num_step_Y -= 1
                    else:
                        None # not handled
                    break
            descriptors.append(des)

        if not size_not_equal:
            break

    try:
        data = np.float64(descriptors)
    except:
        raise ValueError("Error at converting descriptors to float64!!") 

    silhouette_best = -1
    compactness = float("inf")
    separability = -1
    have_labels = False

    tol = 0.0000001

    percentage_comparison_one = 0.0
    percentage_comparison_two = 0.0

    if len(data) > 50:
        n_clusters = len(data)/3.0

        if n_clusters <= 2:
            n_clusters_list = range(2, len(data) - 1)
        else:
            while True:
                if n_clusters >= 50:
                    n_clusters /= 3.0
                else:
                    break
            n_clusters_list = range(2, int(math.ceil(n_clusters)))
    else:
        if len(data) < 10:
            n_clusters_list = range(2, len(data)-1)
        else:
            n_clusters_list = range(2, len(data)//3)

    for count,n_clusters in enumerate(n_clusters_list):
        kMeans = cluster.KMeans(init='k-means++', n_clusters=n_clusters, n_init=10, tol=tol, max_iter=11000)
        try:
            kMeans.fit(data)
        except:
            have_labels = False
            break

        if n_clusters < len(data) and len(set(kMeans.labels_)) > 1:
            score = silhouette_score(data, kMeans.labels_)
        else:
            score = -1
        # get distances of the samples
        distances = kMeans.transform(data)

        centers = kMeans.cluster_centers_
        center_distances = kMeans.transform(kMeans.cluster_centers_)
        
        counts = [0,0]
        for i in range(len(centers)):
            c = list(kMeans.labels_).count(i)
            if c == 1:
                counts[0] += 1
            if c == 2:
                counts[1] += 1

        if counts[0] <= numImgs*percentage_comparison_one and counts[1] <= numImgs*percentage_comparison_two:
            distances_by_class_samples = []
            distances_by_class_centers = []
            for i in range(len(centers)):
                distances_by_class_samples.append([])
                distances_by_class_centers.append([])

                for sample_class, sample in zip(kMeans.labels_, distances):
                    if sample_class == i:
                        distances_by_class_samples[i].append(sample[i])

                for distance in center_distances:
                    distances_by_class_centers[i].append(distance[i])

            num_centers = float(len(centers))
            average_distance_samples = 0
            for group in distances_by_class_samples:
                sum_distances = 0
                for distances in group:
                    sum_distances += distances

                if len(group) > 0:
                    average_distance_samples += sum_distances/float(len(group))
                else:
                    num_centers -= 1

            if num_centers > 0:
                average_distance_samples = average_distance_samples/num_centers
            else:
                average_distance_samples = compactness + 1

            num_centers = float(len(centers))
            average_distance_centers = 0
            for group in distances_by_class_centers:
                sum_distances = 0
                for distances in group:
                    sum_distances += distances

                if len(group) - 1 > 0:
                    average_distance_centers += sum_distances/float(len(group) - 1)
                else:
                    num_centers -= 1

            if num_centers > 0:
                average_distance_centers = average_distance_centers/num_centers
            else:
                average_distance_centers = separability - 1

            if average_distance_samples <= compactness and score >= silhouette_best and average_distance_centers >= separability:
                compactness = average_distance_samples
                silhouette_best = score
                separability = average_distance_centers
                cluster_labels = kMeans.labels_
                have_labels = True

            if n_clusters == num_centers and compactness == 0 and score == -1 and separability == 0:
                return False

    if not have_labels:
        return False
    setList = set(cluster_labels)
    npList = cluster_labels

    for i, group in enumerate(setList):
        indexList = np.array(range(len(npList)))[npList == group]
        lenImages = len(indexList)
        res = True
        if lenImages > minImages and level < level_limit:
            if beforeNumImages != lenImages:
                newCrops = {}
                for index in indexList:
                    newCrops[list(crops.keys())[index]] = list(crops.values())[index]
                if len(newCrops) <= n_clusters - 1:
                    n_clusters = len(newCrops) - 1
                else:
                    n_clusters -= 1
                    if n_clusters <= 0:
                        n_clusters = 2
                if lenImages > 15:
                    
                    res = clustering(newCrops, numImgs, lenImages, finalClusters, n_clusters, level+1, minImages, debug, level_limit)
                else:
                    res = clustering(newCrops, numImgs, lenImages, finalClusters, n_clusters, level, minImages, debug, level_limit)
            else:
                return False
        else:
            res = False
        
        if res == False:
            finalImagePaths = []
            
            for index in indexList:
                finalImagePaths.append(list(crops.keys())[index])
            finalClusters.append(finalImagePaths)

def start_kmeans(bounding_boxes_json, images_path, minImages = 3, debug = False, level_limit = 0):

    if level_limit == 0:
        level_limit = float("inf")

    crops = {}

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
    
    numImgs = len(bounding_boxes_json["documents"])

    finalClusters = []
    
    clustering(crops, numImgs, 0, finalClusters, minImages = minImages, debug = debug, level_limit = level_limit)

    # remove duplicate clusters
    finalClusters.sort()
    finalClusters = list(finalClusters for finalClusters, _ in itertools.groupby(finalClusters))

    # enter results into bounding_boxes_json, for each symbol a cluster_id
    for i, imagePaths in enumerate(finalClusters): # one list for one cluster
        for path in imagePaths: # items (names of boxes) of a given cluster
            for key, value in bounding_boxes_json["documents"].items():
                for symb_index, symb in enumerate(value):
                    if symb["name"] == path:
                        bounding_boxes_json["documents"][key][symb_index]["cluster_id"] = str(i)
                        
    return bounding_boxes_json

def main(bounding_boxes_json, transcription_json, images_path, additional_arguments):
    
    error_message = None

    try:
        bounding_boxes_json = start_kmeans(bounding_boxes_json, images_path, minImages=additional_arguments["current_execution"]["minImages"])
        
    except:
        error_message = traceback.format_exc()

    # here we do not change the transcription, so we just send it back without changing it
    # this is necessary to make the interfaces of all python codes the same
    return error_message, bounding_boxes_json, transcription_json

if __name__ == "__main__":
    main()