# ************************************************************************************************************
# Segments lines of text in images. Takes a list of images as input and returns a list of lines for each image.
# Please note that this code clears out any previous boxes from the inputted bounding_boxes_json.
#
# The original version of this code was written by the authors of the paper "Towards a Generic Unsupervised
# Method for Transcription of Encoded Manuscripts" (https://doi.org/10.1145/3322905.3322920). The code
# was kindly provided by Jialuo Chen and was adapted to work with the TranscriptTool.
# ************************************************************************************************************

import cv2
import numpy as np
import peakutils

import traceback
from image_processing_wrapper import FLOAT_PRECISION

def invert(img):
    img = abs(255 - img)
    img = img / 255

    return img

def enhance(img):
    kernel = np.ones((5, 5), np.uint8)
    img = cv2.erode(img, kernel, iterations=1)
    kernel = np.ones((15, 15), np.uint8)
    img = cv2.dilate(img, kernel, iterations=1)

    return img

def projection_analysis(img):
    # compute the ink density histogram (sum each rows)
    hist = cv2.reduce(img, 1, cv2.REDUCE_SUM, dtype=cv2.CV_32F)
    hist = hist.ravel()
    # find peaks withing the ink density histogram
    max_hist = max(hist)
    mean_hist = np.mean(hist)
    thres_hist = mean_hist / max_hist
    peaks = peakutils.indexes(hist, thres=thres_hist, min_dist=50)
    # find peaks that are too high
    mean_peaks = np.mean(hist[peaks])
    std_peaks = np.std(hist[peaks])
    thres_peaks_high = mean_peaks + 1.5 * std_peaks
    thres_peaks_low = mean_peaks - 3 * std_peaks
    peaks = peaks[np.logical_and(hist[peaks] < thres_peaks_high,
                                 hist[peaks] > thres_peaks_low)]

    return peaks

def getLines(img):
    # invert bw image
    img = np.float32(img)
    img = invert(img)
    # enhance the image with morphological operations
    img = enhance(img)
    # execute projection profile analysis to localize lines of text
    peaks = projection_analysis(img)
    # compute the valley between each pair of consecutive peaks
    indexes = []
    for i in range(0, len(peaks) - 1):
        dist = (peaks[i + 1] - peaks[i]) / 2
        valley = peaks[i] + dist
        indexes.append(valley)

    return indexes

def projectionLines(img, lines):
    (rows, cols) = img.shape
    h_projection = np.array([x / 255 / cols for x in img.sum(axis=1)])
    h_projection = abs(1 - h_projection)

    avg_dist = 0
    for line in lines:
        avg_dist += line[3]
    avg_dist = avg_dist/len(lines)
    avg_dist = avg_dist*2/3
    indicesObj = peakutils.indexes(h_projection, thres=0.05, min_dist=avg_dist)

    aux_peaks = [0] + list(indicesObj) + [cols]
    line_mean = 0
    for i in range(len(aux_peaks) - 1):
        line_mean += (aux_peaks[i + 1] - aux_peaks[i])
    line_mean /= len(aux_peaks) - 1

    return indicesObj, line_mean

def loadimage(imagepath):
    return cv2.imread(imagepath, 0)

def binarize(img):
    _, bina = cv2.threshold(img,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)
    return bina

def cropLines(peaks, image, symbols, filename, line_mean, ext):
    return_lines = []
    for indPeak in range(0, len(peaks)):
        mask = np.zeros(image.shape, dtype=bool)
        firstColumn = firstRow = 9999
        lastColumn = lastRow = 0
        for indSym in range(0, len(symbols)):
            if symbols[indSym][2] == indPeak:
                stat = symbols[indSym][3]
                left = stat[cv2.CC_STAT_LEFT]
                top = stat[cv2.CC_STAT_TOP]
                w = stat[cv2.CC_STAT_WIDTH]
                h = stat[cv2.CC_STAT_HEIGHT]
                if left < firstColumn and left != 0:
                    firstColumn = left
                if top < firstRow and top != 0:
                    firstRow = top
                if left+w > lastColumn and left+w != image.shape[1]:
                    lastColumn = left+w
                if top+h > lastRow and top+h != image.shape[0]:
                    lastRow = top+h
                mask[top:top + h, left:left + w] += symbols[indSym][0]
        return_lines.append([firstColumn, firstRow, lastColumn-firstColumn, lastRow-firstRow])

    return return_lines

def connectedComponents(image, peaks, littleSymbol=False):
    output = cv2.connectedComponentsWithStats(~image, 4, cv2.CV_32S)
    symbols = []
    for indCC in range(1, output[0]):
        stat = output[2][indCC]
        compare_stat_area = 50
        double_touch_compare_area = 400
        if stat[cv2.CC_STAT_HEIGHT] * stat[cv2.CC_STAT_WIDTH] >= compare_stat_area:
            touch = False
            double_touch = False
            minInd = -1
            for indPeaks in range(0, len(peaks)):
                if stat[cv2.CC_STAT_TOP] <= peaks[indPeaks] <= stat[cv2.CC_STAT_TOP] + stat[cv2.CC_STAT_HEIGHT]:
                    minInd = indPeaks
                    touch = True
                    if indPeaks < len(peaks) - 1:
                        if stat[cv2.CC_STAT_TOP] <= peaks[indPeaks + 1] <= stat[cv2.CC_STAT_TOP] + stat[
                            cv2.CC_STAT_HEIGHT]:
                            double_touch = True
                    break
            if not touch:
                minDist = 9999
                for indPeaks in range(0, len(peaks)):
                    if abs(output[3][indCC][1] - (peaks[indPeaks])) < minDist:
                        minDist = abs(output[3][indCC][1] - peaks[indPeaks])
                        minInd = indPeaks
            left = stat[cv2.CC_STAT_LEFT]
            top = stat[cv2.CC_STAT_TOP]
            w = stat[cv2.CC_STAT_WIDTH]
            h = stat[cv2.CC_STAT_HEIGHT]

            if double_touch:
                crop = np.array(output[1][top:top + h, left:left + w])
                crop[crop != indCC] = 0
                crop[crop == indCC] = 1
                centroide = output[3][indCC]
                top_padding = int(centroide[1] - stat[1])
                crop_top = crop[0:top_padding, :]
                crop_bottom = crop[top_padding:crop.shape[0], :]
                crop_top = np.array(crop_top, dtype=np.uint8)
                crop_bottom = np.array(crop_bottom, dtype=np.uint8)

                cc_output = cv2.connectedComponentsWithStats(crop_top, 4, cv2.CV_32S)

                for ind_cc in range(1, cc_output[0]):
                    if cc_output[2][ind_cc][2] * cc_output[2][ind_cc][3] > double_touch_compare_area:
                        new_top_stats = cc_output[2][ind_cc]
                        new_top_centroid = cc_output[3][ind_cc]

                        crop_top = cc_output[1][new_top_stats[1]:new_top_stats[1] + new_top_stats[3],
                                   new_top_stats[0]:new_top_stats[0] + new_top_stats[2]]
                        crop_top[crop_top != ind_cc] = False
                        crop_top[crop_top == ind_cc] = True
                        crop_top = np.array(crop_top, dtype=bool)
                        new_top_centroid[0] += left
                        new_top_centroid[1] += top

                        new_top_stats[0] += left
                        new_top_stats[1] += top

                        symbols.append([crop_top, new_top_centroid, minInd, new_top_stats])

                cc_output = cv2.connectedComponentsWithStats(crop_bottom, 4, cv2.CV_32S)

                for ind_cc in range(1, cc_output[0]):
                    if cc_output[2][ind_cc][2] * cc_output[2][ind_cc][3] > double_touch_compare_area:
                        new_bottom_stats = cc_output[2][ind_cc]
                        new_bottom_centroid = cc_output[3][ind_cc]

                        crop_bottom = cc_output[1][new_bottom_stats[1]:new_bottom_stats[1] + new_bottom_stats[3],
                                      new_bottom_stats[0]:new_bottom_stats[0] + new_bottom_stats[2]]
                        crop_bottom[crop_bottom != ind_cc] = False
                        crop_bottom[crop_bottom == ind_cc] = True
                        crop_bottom = np.array(crop_bottom, dtype=bool)
                        new_bottom_centroid[0] += left
                        new_bottom_centroid[1] += top + top_padding

                        new_bottom_stats[0] += left
                        new_bottom_stats[1] += top + top_padding

                        symbols.append([crop_bottom, new_bottom_centroid, minInd + 1, new_bottom_stats])
            else:
                crop = np.array(output[1][top:top + h, left:left + w])
                crop[crop != indCC] = False
                crop[crop == indCC] = True
                crop = np.array(crop, dtype=bool)
                centroide = output[3][indCC]
                symbols.append([crop, centroide, minInd, stat])
    return symbols

def segmentation(bounding_boxes, images_path, use_segmented_lines=False):

    bounding_boxes["lines"] = {}

    for i, (image_name, symbol_list) in enumerate(bounding_boxes["documents"].items()):

        image = cv2.imread(f'{images_path}/{image_name}', 0) # load the image as a grey scale

        im_width = image.shape[1]
        im_height = image.shape[0]

        lines = []
        user_lines = []

        # this method uses already segmented lines
        if use_segmented_lines:
            for boxes in symbol_list:
                left = int(boxes["left"] * im_width)
                top = int(boxes["top"] * im_height)
                width = int(boxes["width"] * im_width)
                height = int(boxes["height"] * im_height)

                user_lines.append([left, top, width, height])

            peaks, line_mean = projectionLines(image, user_lines)
            symbols = connectedComponents(image, peaks)
            lines = cropLines(peaks, image, symbols, None, line_mean, None)
        # this method don't need parameters
        else:
            peaks = getLines(image)
            top = 1
            for peak in peaks:
                peak = int(peak)
                lines.append([1, top, im_width - 1, peak - top])
                top = peak
            lines.append([1, top, im_width - 1, im_height - 1 - top])

        # clear out previous boxes to prepare for the new lines
        bounding_boxes["documents"][image_name] = []
        bounding_boxes["lines"][image_name] = []
        
        for index, l in enumerate(lines):
            if use_segmented_lines and len(user_lines) > 0:
                for user_l_index, user_l in enumerate(user_lines):
                    aux_top = (user_l[1] if user_l[1] < l[1] else l[1])
                    aux_bottom = (user_l[1]+user_l[3] if user_l[1]+user_l[3] < l[1]+l[3] else l[1]+l[3])

                    collision_height = (aux_bottom-aux_top)/user_l[3]
                    if collision_height > 0.5:
                        l = user_l
                        remove_user_line = True
                        break
                if remove_user_line:
                    del user_lines[user_l_index]

            dic = {
                "left": round(l[0] / im_width, FLOAT_PRECISION),
                "top": round(l[1] / im_height, FLOAT_PRECISION),
                "width": round(l[2] / im_width, FLOAT_PRECISION),
                "height": round(l[3] / im_height, FLOAT_PRECISION),
            }

            # save lines as main output
            bounding_boxes["documents"][image_name].append(dic)

    return bounding_boxes

def main(bounding_boxes_json, transcription_json, images_path, additional_arguments):

    error_message = None

    try:
        bounding_boxes_json = segmentation(bounding_boxes_json, images_path, use_segmented_lines=additional_arguments["current_execution"]["two_segmented_lines"])
        
    except:
        error_message = traceback.format_exc()

    # here we do not change the transcription, so we just send it back without changing it
    # this is necessary to make the interfaces of all python codes the same
    return error_message, bounding_boxes_json, transcription_json

if __name__ == "__main__":
    main()
