# ************************************************************************************************************
# Segments individual symbols with lines in images. Takes a list of images as input and returns a list of lines
# and list of symbols for each image. See functions "cropLines" and "orderCroppedSymbols" respectively. Uses
# a variety of parameters (provided by the user) to control the segmentation process.
# Please note that this code clears out any previous boxes from the inputted bounding_boxes_json.
#
# The original version of this code was written by the authors of the paper "Towards a Generic Unsupervised
# Method for Transcription of Encoded Manuscripts" (https://doi.org/10.1145/3322905.3322920). The code
# was kindly provided by Jialuo Chen and was adapted to work with the TranscriptTool.
# ************************************************************************************************************

import cv2
import peakutils
import math
import numpy as np

import traceback
from image_processing_wrapper import FLOAT_PRECISION

def orderCroppedSymbols(symbols, thSizeCC, gt, image_name, image):

    height, width = image.shape

    for index, byLine in enumerate(symbols):
        symbolIsolated = []
        centroide = []
        for symbol in byLine:
            stat = symbol[3]
            div = stat[2]/float(stat[3])
            if stat[2]*stat[3] > thSizeCC:
                symbolIsolated.append(symbol)
                centroide.append(symbol[1][0])

        for indOrdered, item in enumerate(symbolIsolated):
            stat = item[3]
            left = stat[cv2.CC_STAT_LEFT]
            top = stat[cv2.CC_STAT_TOP]
            w = stat[cv2.CC_STAT_WIDTH]
            h = stat[cv2.CC_STAT_HEIGHT]

            # add the boxes in the format of the bounding_boxes.json
            gt["documents"][image_name].append({
                "left": round(left / width, FLOAT_PRECISION),
                "top": round(top / height, FLOAT_PRECISION),
                "width": round(w / width, FLOAT_PRECISION),
                "height": round(h / height, FLOAT_PRECISION),
            })

    return gt

def cropSymbols(symbol,image,th_AboveBelowSymbol,numLines,line_mean,littleSymbol=False, topBottomCheck=False,leftRightCheck=False,insideCheck=False,combineLittleSymbols=True,permitCollision=False, specialSymbols_likely_surrounded = False):
    symbols_by_line = [[] for i in range(numLines)]
    total_croppedSymbols = []
    for item in symbol:
        symbols_by_line[item[2]].append(item)

    if littleSymbol:
        compare_stat_area = 60
        if leftRightCheck:
            compare_two_points = 30
        else:
            compare_two_points = 50
        compare_distance_two_points = 20
        line_mean_div = 2.0
    else:
        compare_stat_area = 800
        if leftRightCheck:
            compare_two_points = 60
        else:
            compare_two_points = 30
        compare_distance_two_points = 120
        line_mean_div = 2.0

    for items in symbols_by_line:
        if len(items) > 0:
            littleSymbols = []
            bigSymbols = []
            for indSym in range(0,len(items)):
                stat = items[indSym][3]
                if stat[2]*stat[3] < compare_stat_area:
                    littleSymbols.append(items[indSym])
                else:
                    bigSymbols.append(items[indSym])
            groupLittleSymbols = []
            for indSym in range(0,len(littleSymbols)):
                if len(groupLittleSymbols)==0:
                    groupLittleSymbols.append([littleSymbols[indSym][0], littleSymbols[indSym][1], littleSymbols[indSym][2], littleSymbols[indSym][3]])
                else:
                    combine = False
                    upDown = False
                    leftRight = False
                    if combineLittleSymbols:
                        for indCrops in range(0,len(groupLittleSymbols)):
                            if (abs(littleSymbols[indSym][1][0]-groupLittleSymbols[indCrops][1][0])) <= compare_two_points: # :
                                if (abs(littleSymbols[indSym][1][1]-groupLittleSymbols[indCrops][1][1]) <= compare_distance_two_points):
                                    combine = True
                                    upDown = True
                            if combine:
                                mask = np.zeros(image.shape, dtype=bool)
                                stat = groupLittleSymbols[indCrops][3]
                                left = stat[cv2.CC_STAT_LEFT]
                                top = stat[cv2.CC_STAT_TOP]
                                w = stat[cv2.CC_STAT_WIDTH]
                                h = stat[cv2.CC_STAT_HEIGHT]
                                mask[top:top+h,left:left+w] += groupLittleSymbols[indCrops][0]

                                stat = littleSymbols[indSym][3]
                                left = stat[cv2.CC_STAT_LEFT]
                                top = stat[cv2.CC_STAT_TOP]
                                w = stat[cv2.CC_STAT_WIDTH]
                                h = stat[cv2.CC_STAT_HEIGHT]
                                mask[top:top+h,left:left+w] += littleSymbols[indSym][0]
                                
                                x1, y1 = groupLittleSymbols[indCrops][1]
                                x2, y2 = littleSymbols[indSym][1]
                                dist_x = abs(x2-x1)/2.0
                                dist_y = abs(y2-y1)/2.0
                                if upDown:
                                    if y1 > y2:
                                        groupLittleSymbols[indCrops][1] = [x2+dist_x,y2+dist_y]
                                    else:
                                        groupLittleSymbols[indCrops][1] = [x1+dist_x,y1+dist_y]
                                if leftRight:
                                    if x1 > x2:
                                        groupLittleSymbols[indCrops][1] = [x2+dist_x,y2+dist_y]
                                    else:
                                        groupLittleSymbols[indCrops][1] = [x1+dist_x,y1+dist_y]

                                aux_mask =  mask.astype(int)
                                firstRow = np.where(aux_mask.max(axis=1)>0)[0][0]
                                lastRow = np.where(aux_mask.max(axis=1)>0)[0][-1]
                                firstColumn = np.where(aux_mask.max(axis=0)>0)[0][0]
                                lastColumn = np.where(aux_mask.max(axis=0)>0)[0][-1]
                                groupLittleSymbols[indCrops][0] = mask[firstRow:lastRow,firstColumn:lastColumn]

                                stat = groupLittleSymbols[indCrops][3]
                                stat[cv2.CC_STAT_LEFT] = firstColumn
                                stat[cv2.CC_STAT_TOP] = firstRow
                                stat[cv2.CC_STAT_WIDTH] = lastColumn - firstColumn
                                stat[cv2.CC_STAT_HEIGHT] = lastRow - firstRow
                                stat[cv2.CC_STAT_AREA] = stat[cv2.CC_STAT_WIDTH]*stat[cv2.CC_STAT_HEIGHT]
                                break
                    if not combine:
                        groupLittleSymbols.append([littleSymbols[indSym][0], littleSymbols[indSym][1], littleSymbols[indSym][2], littleSymbols[indSym][3]])
            not_added_component = np.zeros((len(groupLittleSymbols),len(bigSymbols)),dtype=int)
            items = []
            for indBig in range(0,len(bigSymbols)):
                stat_big = bigSymbols[indBig][3]
                centr_big = bigSymbols[indBig][1]
                for indLit in range(0,len(groupLittleSymbols)):
                    if 1 in not_added_component[indLit]:
                        continue
                    stat_lit = groupLittleSymbols[indLit][3]
                    centr_lit = groupLittleSymbols[indLit][1]
                    if stat_big[cv2.CC_STAT_LEFT] > stat_lit[cv2.CC_STAT_LEFT]:
                        start_x = stat_big[cv2.CC_STAT_LEFT]
                    else:
                        start_x = stat_lit[cv2.CC_STAT_LEFT]
                    if stat_big[cv2.CC_STAT_LEFT]+stat_big[cv2.CC_STAT_WIDTH] < stat_lit[cv2.CC_STAT_LEFT]+stat_lit[cv2.CC_STAT_WIDTH]:
                        end_x = stat_big[cv2.CC_STAT_LEFT]+stat_big[cv2.CC_STAT_WIDTH]
                    else:
                        end_x = stat_lit[cv2.CC_STAT_LEFT]+stat_lit[cv2.CC_STAT_WIDTH]
                    percentage_collision_vertically = (stat_lit[3]*(end_x-start_x))/float(stat_lit[2]*stat_lit[3])
                    centroid_dist = math.sqrt((centr_big[0]-centr_lit[0])**2+(centr_big[1]-centr_lit[1])**2)
                    if percentage_collision_vertically >= 0.5 and centroid_dist <= line_mean/line_mean_div and (stat_big[cv2.CC_STAT_TOP] > stat_lit[cv2.CC_STAT_TOP]+stat_lit[cv2.CC_STAT_HEIGHT] or stat_big[cv2.CC_STAT_TOP]+stat_big[cv2.CC_STAT_HEIGHT] < stat_lit[cv2.CC_STAT_TOP]):
                        mask = np.zeros(image.shape, dtype=bool)
                        stat = bigSymbols[indBig][3]
                        left = stat[cv2.CC_STAT_LEFT]
                        top = stat[cv2.CC_STAT_TOP]
                        w = stat[cv2.CC_STAT_WIDTH]
                        h = stat[cv2.CC_STAT_HEIGHT]
                        mask[top:top+h,left:left+w] += bigSymbols[indBig][0]
                        
                        stat = groupLittleSymbols[indLit][3]
                        left = stat[cv2.CC_STAT_LEFT]
                        top = stat[cv2.CC_STAT_TOP]
                        w = stat[cv2.CC_STAT_WIDTH]
                        h = stat[cv2.CC_STAT_HEIGHT]
                        mask[top:top+h,left:left+w] += groupLittleSymbols[indLit][0]

                        aux_mask =  mask.astype(int)
                        firstRow = np.where(aux_mask.max(axis=1)>0)[0][0]
                        lastRow = np.where(aux_mask.max(axis=1)>0)[0][-1]
                        firstColumn = np.where(aux_mask.max(axis=0)>0)[0][0]
                        lastColumn = np.where(aux_mask.max(axis=0)>0)[0][-1]
                        bigSymbols[indBig][0] = mask[firstRow:lastRow,firstColumn:lastColumn]
                        
                        stat = bigSymbols[indBig][3]
                        stat[cv2.CC_STAT_LEFT] = firstColumn
                        stat[cv2.CC_STAT_TOP] = firstRow
                        stat[cv2.CC_STAT_WIDTH] = lastColumn - firstColumn
                        stat[cv2.CC_STAT_HEIGHT] = lastRow - firstRow
                        stat[cv2.CC_STAT_AREA] = stat[cv2.CC_STAT_WIDTH]*stat[cv2.CC_STAT_HEIGHT]
                        
                        not_added_component[indLit][indBig] = 1
                    elif percentage_collision_vertically >= 1 and (stat_big[cv2.CC_STAT_TOP] < stat_lit[cv2.CC_STAT_TOP] and stat_big[cv2.CC_STAT_TOP]+stat_big[cv2.CC_STAT_HEIGHT] > stat_lit[cv2.CC_STAT_TOP]):
                        mask = np.zeros(image.shape, dtype=bool)
                        stat = bigSymbols[indBig][3]
                        left = stat[cv2.CC_STAT_LEFT]
                        top = stat[cv2.CC_STAT_TOP]
                        w = stat[cv2.CC_STAT_WIDTH]
                        h = stat[cv2.CC_STAT_HEIGHT]
                        mask[top:top+h,left:left+w] += bigSymbols[indBig][0]
                        
                        stat = groupLittleSymbols[indLit][3]
                        left = stat[cv2.CC_STAT_LEFT]
                        top = stat[cv2.CC_STAT_TOP]
                        w = stat[cv2.CC_STAT_WIDTH]
                        h = stat[cv2.CC_STAT_HEIGHT]
                        mask[top:top+h,left:left+w] += groupLittleSymbols[indLit][0]
                        
                        #Surrounded check
                        left_ok, top_ok, right_ok, bottom_ok = False,False,False,False
                        aux_mask = mask[top:top+h,0:left].astype(int)
                        inds = np.where(aux_mask.max(axis=0)>0)[0]
                        if len(inds) > 0:
                            left_ok = True
                        aux_mask = mask[top:top+h,left+w:mask.shape[1]].astype(int)
                        inds = np.where(aux_mask.max(axis=0)>0)[0]
                        if len(inds) > 0:
                            right_ok = True
                        aux_mask = mask[0:top,left:left+w].astype(int)
                        inds = np.where(aux_mask.max(axis=1)>0)[0]
                        if len(inds) > 0:
                            top_ok = True
                        aux_mask = mask[top+h:mask.shape[0],left:left+w].astype(int)
                        inds = np.where(aux_mask.max(axis=1)>0)[0]
                        if len(inds) > 0:
                            bottom_ok = True
                        
                        aux = np.array([left_ok,top_ok,right_ok,bottom_ok])
                        u, c = np.unique(aux, return_counts=True)
                        d = dict(zip(u, c))
                        if (left_ok and top_ok and right_ok and bottom_ok) or (specialSymbols_likely_surrounded and d[True] >= 2):
                            aux_mask =  mask.astype(int)
                            firstRow = np.where(aux_mask.max(axis=1)>0)[0][0]
                            lastRow = np.where(aux_mask.max(axis=1)>0)[0][-1]
                            firstColumn = np.where(aux_mask.max(axis=0)>0)[0][0]
                            lastColumn = np.where(aux_mask.max(axis=0)>0)[0][-1]
                            bigSymbols[indBig][0] = mask[firstRow:lastRow,firstColumn:lastColumn]
                            
                            stat = bigSymbols[indBig][3]
                            stat[cv2.CC_STAT_LEFT] = firstColumn
                            stat[cv2.CC_STAT_TOP] = firstRow
                            stat[cv2.CC_STAT_WIDTH] = lastColumn - firstColumn
                            stat[cv2.CC_STAT_HEIGHT] = lastRow - firstRow
                            stat[cv2.CC_STAT_AREA] = stat[cv2.CC_STAT_WIDTH]*stat[cv2.CC_STAT_HEIGHT]
                            
                            not_added_component[indLit][indBig] = 1
                    elif percentage_collision_vertically <= 0:
                        x1, y1 = bigSymbols[indBig][1]
                        x2, y2 = groupLittleSymbols[indLit][1]
                        if math.sqrt((x2-x1)**2+(y2-y1)**2) > line_mean/line_mean_div:
                            not_added_component[indLit][indBig] = -1
                    else:
                        not_added_component[indLit][indBig] = 0
                items.append(bigSymbols[indBig])
            for i, check in enumerate(not_added_component):
                unique, counts = np.unique(check, return_counts = True)
                aux = dict(zip(unique,counts))
                if -1 in aux:
                    if not 1 in aux:
                        items.append(groupLittleSymbols[i])
                else:
                    if 1 not in aux:
                        items.append(groupLittleSymbols[i])
            
            order = []
            matrices = []
            centroides =[]
            lines = []
            stats = []
            for indSym in range(0,len(items)):
                matrices.append(items[indSym][0])
                centroides.append(items[indSym][1])
                lines.append(items[indSym][2])
                stats.append(items[indSym][3])
                order.append(items[indSym][1][0])
            indicesOrder = np.argsort(order)
            symbols =[]
            for indInd in range(0,len(indicesOrder)):
                symbols.append([matrices[indicesOrder[indInd]],centroides[indicesOrder[indInd]],lines[indicesOrder[indInd]],stats[indicesOrder[indInd]]])
            
            croppedSymbols = []
            for indSym in range(0,len(symbols)):
                stat_sym = symbols[indSym][3]
                cent_sym = symbols[indSym][1]
                if len(croppedSymbols)==0:
                        croppedSymbols.append([symbols[indSym][0], symbols[indSym][1], symbols[indSym][2], symbols[indSym][3]])
                else:
                    related = False
                    for indCrops in range(0,len(croppedSymbols)):
                        stat_cro = croppedSymbols[indCrops][3]
                        cent_cro = croppedSymbols[indCrops][1]
                        
                        cent_dist = math.sqrt((cent_sym[0]-cent_cro[0])**2+(cent_sym[1]-cent_cro[1])**2)
                        if cent_dist >= line_mean:
                            continue
                        if symbols[indSym][3][cv2.CC_STAT_WIDTH]*symbols[indSym][3][cv2.CC_STAT_HEIGHT] > croppedSymbols[indCrops][3][cv2.CC_STAT_WIDTH]*croppedSymbols[indCrops][3][cv2.CC_STAT_HEIGHT]:
                            stat_big = symbols[indSym][3]
                            stat_lit = croppedSymbols[indCrops][3]
                            sym_lit = False
                        else:
                            stat_lit = symbols[indSym][3]
                            stat_big = croppedSymbols[indCrops][3]
                            sym_lit = True
                        
                        if stat_big[cv2.CC_STAT_LEFT] > stat_lit[cv2.CC_STAT_LEFT]:
                            start_x = stat_big[cv2.CC_STAT_LEFT]
                            md_left = stat_lit[cv2.CC_STAT_LEFT]+stat_lit[cv2.CC_STAT_WIDTH]
                            md_right = stat_big[cv2.CC_STAT_LEFT]
                        else:
                            start_x = stat_lit[cv2.CC_STAT_LEFT]
                            md_left = stat_big[cv2.CC_STAT_LEFT]+stat_big[cv2.CC_STAT_WIDTH]
                            md_right = stat_lit[cv2.CC_STAT_LEFT]
                        if stat_big[cv2.CC_STAT_LEFT]+stat_big[cv2.CC_STAT_WIDTH] < stat_lit[cv2.CC_STAT_LEFT]+stat_lit[cv2.CC_STAT_WIDTH]:
                            end_x = stat_big[cv2.CC_STAT_LEFT]+stat_big[cv2.CC_STAT_WIDTH]
                        else:
                            end_x = stat_lit[cv2.CC_STAT_LEFT]+stat_lit[cv2.CC_STAT_WIDTH]
                            
                        percentage_collision_vertically = (stat_lit[3]*(end_x-start_x))/float((stat_lit[2]*stat_lit[3]))
                        min_dist = md_right - md_left
                        

                        collided = (stat_lit[0] < stat_big[0]+stat_big[2] and stat_lit[0]+stat_lit[2] > stat_big[0] and stat_lit[1] < stat_big[1]+stat_big[3] and stat_lit[1]+stat_lit[3] > stat_big[1])
                        
                        mask = np.zeros(image.shape, dtype=bool)
                        stat = croppedSymbols[indCrops][3]
                        left = stat[cv2.CC_STAT_LEFT]
                        top = stat[cv2.CC_STAT_TOP]
                        w = stat[cv2.CC_STAT_WIDTH]
                        h = stat[cv2.CC_STAT_HEIGHT]
                        mask[top:top+h,left:left+w] += croppedSymbols[indCrops][0]

                        stat = symbols[indSym][3]
                        left = stat[cv2.CC_STAT_LEFT]
                        top = stat[cv2.CC_STAT_TOP]
                        w = stat[cv2.CC_STAT_WIDTH]
                        h = stat[cv2.CC_STAT_HEIGHT]
                        mask[top:top+h,left:left+w] += symbols[indSym][0]
                        
                        if sym_lit:
                            stat = croppedSymbols[indCrops][3]
                            left = stat[cv2.CC_STAT_LEFT]
                            top = stat[cv2.CC_STAT_TOP]
                            w = stat[cv2.CC_STAT_WIDTH]
                            h = stat[cv2.CC_STAT_HEIGHT]
                        
                        top_ok, bottom_ok = False, False
                        if permitCollision or (not permitCollision and not collided):
                            aux_mask = mask[0:top-1,left+int(w*3/5.0):left+w].astype(int)
                            top_inds = np.where(aux_mask.max(axis=1)>0)[0]
                            if len(top_inds) > 0:
                                top_inds = top_inds[-1]
                                if top - top_inds <= compare_distance_two_points:
                                    top_ok = True
                            aux_mask = mask[top+h+1:mask.shape[0],left:left+w].astype(int)
                            bottom_inds = np.where(aux_mask.max(axis=1)>0)[0]
                            if len(bottom_inds) > 0 and percentage_collision_vertically >= 0.65:
                                bottom_inds = bottom_inds[0]
                                if bottom_inds <= 15:
                                    bottom_ok = True
                        
                        if topBottomCheck and (top_ok or bottom_ok) and not (stat_big[cv2.CC_STAT_TOP] < stat_lit[cv2.CC_STAT_TOP] and stat_big[cv2.CC_STAT_TOP] + stat_big[cv2.CC_STAT_HEIGHT] > stat_lit[cv2.CC_STAT_TOP] + stat_lit[cv2.CC_STAT_HEIGHT]):
                            related = True
                            if stat_big[cv2.CC_STAT_LEFT] == symbols[indSym][3][cv2.CC_STAT_LEFT]:
                                croppedSymbols[indCrops][1]=symbols[indSym][1]

                            aux_mask =  mask.astype(int)
                            firstRow = np.where(aux_mask.max(axis=1)>0)[0][0]
                            lastRow = np.where(aux_mask.max(axis=1)>0)[0][-1]
                            firstColumn = np.where(aux_mask.max(axis=0)>0)[0][0]
                            lastColumn = np.where(aux_mask.max(axis=0)>0)[0][-1]
                            croppedSymbols[indCrops][0] = mask[firstRow:lastRow,firstColumn:lastColumn]

                            stat = croppedSymbols[indCrops][3]
                            stat[cv2.CC_STAT_LEFT] = firstColumn
                            stat[cv2.CC_STAT_TOP] = firstRow
                            stat[cv2.CC_STAT_WIDTH] = lastColumn - firstColumn
                            stat[cv2.CC_STAT_HEIGHT] = lastRow - firstRow
                            stat[cv2.CC_STAT_AREA] = stat[cv2.CC_STAT_WIDTH]*stat[cv2.CC_STAT_HEIGHT]

                            break
                        elif insideCheck and percentage_collision_vertically >= 0.75 and stat_lit[2]*stat_lit[3] < compare_stat_area and (stat_big[cv2.CC_STAT_TOP] < stat_lit[cv2.CC_STAT_TOP] and stat_big[cv2.CC_STAT_TOP]+stat_big[cv2.CC_STAT_HEIGHT] > stat_lit[cv2.CC_STAT_TOP]):
                            left_ok, top_ok, right_ok, bottom_ok = False,False,False,False
                            if symbols[indSym][3][cv2.CC_STAT_WIDTH]*symbols[indSym][3][cv2.CC_STAT_HEIGHT] > croppedSymbols[indCrops][3][cv2.CC_STAT_WIDTH]*croppedSymbols[indCrops][3][cv2.CC_STAT_HEIGHT]:
                                stat = croppedSymbols[indCrops][3]
                                left = stat[cv2.CC_STAT_LEFT]
                                top = stat[cv2.CC_STAT_TOP]
                                w = stat[cv2.CC_STAT_WIDTH]
                                h = stat[cv2.CC_STAT_HEIGHT]
                            else:
                                stat = symbols[indSym][3]
                                left = stat[cv2.CC_STAT_LEFT]
                                top = stat[cv2.CC_STAT_TOP]
                                w = stat[cv2.CC_STAT_WIDTH]
                                h = stat[cv2.CC_STAT_HEIGHT]
                                
                            aux_mask = mask[top:top+h,0:left].astype(int)
                            inds = np.where(aux_mask.max(axis=0)>0)[0]
                            if len(inds) > 0:
                                left_ok = True
                            aux_mask = mask[top:top+h,left+w:mask.shape[1]].astype(int)
                            inds = np.where(aux_mask.max(axis=0)>0)[0]
                            if len(inds) > 0:
                                right_ok = True
                            aux_mask = mask[0:top,left:left+w].astype(int)
                            inds = np.where(aux_mask.max(axis=1)>0)[0]
                            if len(inds) > 0:
                                top_ok = True
                            aux_mask = mask[top+h:mask.shape[0],left:left+w].astype(int)
                            inds = np.where(aux_mask.max(axis=1)>0)[0]
                            if len(inds) > 0:
                                bottom_ok = True

                            if (left_ok and top_ok and right_ok and bottom_ok) or ((left_ok or right_ok) and bottom_ok) or cent_dist <= 5:
                                related = True
                                if stat_big[cv2.CC_STAT_LEFT] == symbols[indSym][3][cv2.CC_STAT_LEFT]:
                                    croppedSymbols[indCrops][1]=symbols[indSym][1]
                                aux_mask =  mask.astype(int)
                                firstRow = np.where(aux_mask.max(axis=1)>0)[0][0]
                                lastRow = np.where(aux_mask.max(axis=1)>0)[0][-1]
                                firstColumn = np.where(aux_mask.max(axis=0)>0)[0][0]
                                lastColumn = np.where(aux_mask.max(axis=0)>0)[0][-1]
                                croppedSymbols[indCrops][0] = mask[firstRow:lastRow,firstColumn:lastColumn]

                                stat = croppedSymbols[indCrops][3]
                                stat[cv2.CC_STAT_LEFT] = firstColumn
                                stat[cv2.CC_STAT_TOP] = firstRow
                                stat[cv2.CC_STAT_WIDTH] = lastColumn - firstColumn
                                stat[cv2.CC_STAT_HEIGHT] = lastRow - firstRow
                                stat[cv2.CC_STAT_AREA] = stat[cv2.CC_STAT_WIDTH]*stat[cv2.CC_STAT_HEIGHT]

                                break
                    if not related:
                        croppedSymbols.append([symbols[indSym][0], symbols[indSym][1], symbols[indSym][2], symbols[indSym][3]])
        
        total_croppedSymbols.append(croppedSymbols)
        
    return     total_croppedSymbols

def cropLines(bounding_boxes_json, image_name, peaks, image, symbols, minDistLineSeg):

    lines=[]

    image_height, image_width = image.shape
    
    for indPeak in range(0, len(peaks)):
        mask = np.zeros(image.shape, dtype=bool)
        for indSym in range (0,len(symbols)):
            if symbols[indSym][2]==indPeak:
                stat = symbols[indSym][3]
                left = stat[cv2.CC_STAT_LEFT]
                top = stat[cv2.CC_STAT_TOP]
                w = stat[cv2.CC_STAT_WIDTH]
                h = stat[cv2.CC_STAT_HEIGHT]
                mask[top:top+h, left:left+w] += symbols[indSym][0]
        firstRow = np.where(mask.max(axis=1)>0)[0][0]
        lastRow = np.where(mask.max(axis=1)>0)[0][-1]
        mask = mask[firstRow:lastRow][:]
        lines.append(True^mask)
        # add the lines in the format of the bounding_boxes.json
        bounding_boxes_json["lines"][image_name].append({ # change "lines" to "documents" to draw the lines on the frontend
            "left": 0,
            "top": firstRow / image_height,
            "width": 1,
            "height": (lastRow - firstRow) / image_height
        })

    return len(lines), bounding_boxes_json

def connectedComponents(image, peaks, littleSymbol=False):
    output = cv2.connectedComponentsWithStats(~image, 4, cv2.CV_32S)
    symbols=[]
    for indCC in range(1,output[0]):
        stat = output[2][indCC]
        if littleSymbol:
            compare_stat_area = 10
            double_touch_compare_area = 150
        else:
            compare_stat_area = 25
            double_touch_compare_area = 400
        if stat[cv2.CC_STAT_HEIGHT]*stat[cv2.CC_STAT_WIDTH] >= compare_stat_area:
            touch = False
            double_touch = False
            minInd=-1
            for indPeaks in range(0,len(peaks)):
                if stat[cv2.CC_STAT_TOP] <= peaks[indPeaks] and stat[cv2.CC_STAT_TOP]+stat[cv2.CC_STAT_HEIGHT] >= peaks[indPeaks]:
                    minInd = indPeaks
                    touch = True
                    if indPeaks < len(peaks)-1:
                        if stat[cv2.CC_STAT_TOP] <= peaks[indPeaks+1] and stat[cv2.CC_STAT_TOP]+stat[cv2.CC_STAT_HEIGHT] >= peaks[indPeaks+1]:
                            double_touch = True
                    break
            if touch == False:
                minDist = 9999
                for indPeaks in range(0,len(peaks)):
                    if abs(output[3][indCC][1]-(peaks[indPeaks]))<minDist:
                        minDist = abs(output[3][indCC][1]-peaks[indPeaks])
                        minInd = indPeaks
            left = stat[cv2.CC_STAT_LEFT]
            top = stat[cv2.CC_STAT_TOP]
            w = stat[cv2.CC_STAT_WIDTH]
            h = stat[cv2.CC_STAT_HEIGHT]

            if double_touch:
                crop = np.array(output[1][top:top+h,left:left+w])
                crop[crop != indCC] = 0
                crop[crop == indCC] = 1
                centroide = output[3][indCC]
                top_padding = int(centroide[1]-stat[1])
                crop_top = crop[0:top_padding,:]
                crop_bottom = crop[top_padding:crop.shape[0],:]
                crop_top = np.array(crop_top,dtype=np.uint8)
                crop_bottom = np.array(crop_bottom,dtype=np.uint8)
                
                cc_output = cv2.connectedComponentsWithStats(crop_top, 4, cv2.CV_32S)
                
                for ind_cc in range(1,cc_output[0]):
                    if cc_output[2][ind_cc][2]*cc_output[2][ind_cc][3] > double_touch_compare_area:
                        new_top_stats = cc_output[2][ind_cc]
                        new_top_centroid = cc_output[3][ind_cc]
                        
                        crop_top = cc_output[1][new_top_stats[1]:new_top_stats[1]+new_top_stats[3],new_top_stats[0]:new_top_stats[0]+new_top_stats[2]]
                        crop_top[crop_top != ind_cc] = False
                        crop_top[crop_top == ind_cc] = True
                        crop_top = np.array(crop_top,dtype=bool)
                        new_top_centroid[0] += left
                        new_top_centroid[1] += top

                        new_top_stats[0] += left
                        new_top_stats[1] += top

                        symbols.append([crop_top,new_top_centroid,minInd,new_top_stats])

                cc_output = cv2.connectedComponentsWithStats(crop_bottom, 4, cv2.CV_32S)
                
                for ind_cc in range(1,cc_output[0]):
                    if cc_output[2][ind_cc][2]*cc_output[2][ind_cc][3] > double_touch_compare_area:
                        new_bottom_stats = cc_output[2][ind_cc]
                        new_bottom_centroid = cc_output[3][ind_cc]
                        
                        crop_bottom = cc_output[1][new_bottom_stats[1]:new_bottom_stats[1]+new_bottom_stats[3],new_bottom_stats[0]:new_bottom_stats[0]+new_bottom_stats[2]]
                        crop_bottom[crop_bottom != ind_cc] = False
                        crop_bottom[crop_bottom == ind_cc] = True
                        crop_bottom = np.array(crop_bottom,dtype=bool)
                        new_bottom_centroid[0] += left
                        new_bottom_centroid[1] += top + top_padding

                        new_bottom_stats[0] += left
                        new_bottom_stats[1] += top + top_padding
                        
                        symbols.append([crop_bottom,new_bottom_centroid,minInd+1,new_bottom_stats])
            else:
                crop = np.array(output[1][top:top+h,left:left+w])
                crop[crop != indCC] = False
                crop[crop == indCC] = True
                crop = np.array(crop,dtype=bool)
                centroide = output[3][indCC]
                symbols.append([crop,centroide,minInd,stat])
    return symbols

def projectionLines(img, minDistLineSeg, thresLineSeg):
    (rows,cols) = img.shape
    h_projection = np.array([ x/255/cols for x in img.sum(axis=1)])
    h_projection = abs(1-h_projection)
    indicesObj = peakutils.indexes(h_projection, thres=thresLineSeg, min_dist=minDistLineSeg)

    aux_peaks = [0] + list(indicesObj) + [cols]
    line_mean = 0
    for i in range(len(aux_peaks)-1):
        line_mean += (aux_peaks[i+1] - aux_peaks[i])
    line_mean /= len(aux_peaks)-1

    return indicesObj, line_mean

def start_segmentation(bounding_boxes_json, images_path, minDistLineSeg, thresLineSeg, thAboveBelowSymbol, thSizeCC, littleSymbol=False, topBottomCheck=True, leftRightCheck=True, insideCheck=True,combineLittleSymbols=True,permitCollision=True,specialSymbols_likely_surrounded=False):

    bounding_boxes_json["lines"] = {}

    for i, (image_name, symbol_list) in enumerate(bounding_boxes_json["documents"].items()):
        
        # clear out previous boxes to prepare for the new lines and symbols
        bounding_boxes_json["lines"][image_name] = []
        bounding_boxes_json["documents"][image_name] = []

        image = cv2.imread(f'{images_path}/{image_name}', 0) # load image as a grey scale
        
        #Projection
        peaks, line_mean = projectionLines(image, minDistLineSeg, thresLineSeg)
        
        #Connected component
        symbols = connectedComponents(image, peaks, littleSymbol)
        
        #Crop Lines
        numLines, bounding_boxes_json = cropLines(bounding_boxes_json, image_name, peaks, image, symbols, minDistLineSeg)
        
        #Crop Symbols
        croppedSymbols = cropSymbols(symbols, image, thAboveBelowSymbol, numLines, line_mean,littleSymbol,topBottomCheck=topBottomCheck, leftRightCheck=leftRightCheck, insideCheck=insideCheck,combineLittleSymbols=combineLittleSymbols,permitCollision=permitCollision,specialSymbols_likely_surrounded=specialSymbols_likely_surrounded)

        #Order Cropped Symbols
        bounding_boxes_json = orderCroppedSymbols(croppedSymbols, thSizeCC, bounding_boxes_json, image_name, image)
            
    return bounding_boxes_json

def main(bounding_boxes_json, transcription_json, images_path, additional_arguments):

    chosen_setup_dict = additional_arguments["current_execution"]

    error_message = None

    try:
        bounding_boxes_json = start_segmentation(
            bounding_boxes_json, 
            images_path,
            minDistLineSeg=float(chosen_setup_dict["minDistLineSeg"]), 
            thresLineSeg=float(chosen_setup_dict["thresLineSeg"]),
            thAboveBelowSymbol=float(chosen_setup_dict["thAboveBelowSymbol"]),
            thSizeCC=float(chosen_setup_dict["thSizeCC"]), 
            littleSymbol=bool(chosen_setup_dict["littleSymbol"]), 
            topBottomCheck=bool(chosen_setup_dict["topBottomCheck"]), 
            leftRightCheck=bool(chosen_setup_dict["leftRightCheck"]), 
            insideCheck=bool(chosen_setup_dict["insideCheck"]),
            combineLittleSymbols=bool(chosen_setup_dict["combineLittleSymbols"]),
            permitCollision=bool(chosen_setup_dict["permitCollision"]),
            specialSymbols_likely_surrounded=bool(chosen_setup_dict["specialSymbols_likely_surrounded"])
        )
        
    except:
        error_message = traceback.format_exc()

    # here we do not change the transcription, so we just send it back without changing it
    # this is necessary to make the interfaces of all python codes the same
    return error_message, bounding_boxes_json, transcription_json

if __name__ == "__main__":
    main()
