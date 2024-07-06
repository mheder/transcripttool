# ************************************************************************************************************
# Binarizes an image using one of five different methods (1:Otsu 2:Gaussian 3:Adaptive 4:Niblack 5:Sauvola).
# 
# The original version of this code was written by the authors of the paper "Towards a Generic Unsupervised
# Method for Transcription of Encoded Manuscripts" (https://doi.org/10.1145/3322905.3322920). The code
# was kindly provided by Jialuo Chen and was adapted to work with the TranscriptTool.
# ************************************************************************************************************

from skimage.filters import threshold_niblack,threshold_sauvola
import cv2
import numpy as np
import sys

def binarize(im,method):
	if "Otsu" in method:
		bina = binarize_otsu(im)
	if "Gaussian" in method:
		bina = binarize_otsu_gaussian(im)
	if "Adaptive" in method:
		bina = binarize_adaptiveThreshold(im)
	if "Niblack" in method:
		bina = binarize_niblack_ski(im)
	if "Sauvola" in method:
		bina = binarize_sauvola(im)
	return bina

def binarize_otsu(im):
	_,bina = cv2.threshold(im,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)
	return bina

def binarize_otsu_gaussian(im):
	blur = cv2.GaussianBlur(im,(5,5),0)
	_,bina = cv2.threshold(blur,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)
	return bina

def binarize_adaptiveThreshold(im):
	bina = cv2.adaptiveThreshold(im, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 111, 21)
	return bina

def binarize_niblack_ski(im):
	window_size = 125
	thresh_niblack = threshold_niblack(im, window_size=window_size, k=0.8)
	bina = im > thresh_niblack
	bina = np.uint8(bina*255)
	return bina

def binarize_sauvola(im):
	window_size = 125
	thresh_sauvola = threshold_sauvola(im, window_size=window_size)
	bina = im > thresh_sauvola
	bina = np.uint8(bina*255)
	return bina

def binarize_localMinimumMaximum(im):
	kernel_erode_h = np.ones((1,15),np.uint8)

	gfn = [
		lambda x: np.roll(x, -1, axis=0), 
		lambda x: np.roll(np.roll(x, 1, axis=1), -1, axis=0),
		lambda x: np.roll(x, 1, axis=1),
		lambda x: np.roll(np.roll(x, 1, axis=1), 1, axis=0),
		lambda x: np.roll(x, 1, axis=0),
		lambda x: np.roll(np.roll(x, -1, axis=1), 1, axis=0),
		lambda x: np.roll(x, -1, axis=1),
		lambda x: np.roll(np.roll(x, -1, axis=1), -1, axis=0)
		]

	g = im
	I = g.astype(np.float64)

	cimg = localminmax(I, gfn)
	_, ocimg = cv2.threshold(rescale(cimg).astype(g.dtype), 0, 1, cv2.THRESH_OTSU)

	E = ocimg.astype(np.float64)

	N_e = numnb(ocimg, gfn)
	nbmask = N_e>0

	E_mean = np.zeros(I.shape, dtype=np.float64)
	for fn in gfn:
		E_mean += fn(I)*fn(E)

	E_mean[nbmask] /= N_e[nbmask]

	E_var = np.zeros(I.shape, dtype=np.float64)
	for fn in gfn:
		tmp = (fn(I)-E_mean)*fn(E)
		E_var += tmp*tmp

	E_var[nbmask] /= N_e[nbmask]
	E_std = np.sqrt(E_var)#*.7
	
	R = np.ones(I.shape)*255
	R[(I<=E_mean+E_std)&(N_e>=4)] = 0

	return bina

def localminmax(img, fns):
	mi = img.astype(np.float64)
	ma = img.astype(np.float64)
	for i in range(len(fns)):
		rolled = fns[i](img)
		mi = np.minimum(mi, rolled)
		ma = np.maximum(ma, rolled)
	result = (ma-mi)/(mi+ma+1e-16)
	return result

def numnb(bi, fns):
	nb = bi.astype(np.float64)
	i = np.zeros(bi.shape, nb.dtype)
	i[bi==bi.max()] = 1
	i[bi==bi.min()] = 0
	for fn in fns:
		nb += fn(i)
	return nb

def rescale(r,maxvalue=255):
	mi = r.min()
	return maxvalue*(r-mi)/(r.max()-mi)

def main():

	image_path = sys.argv[1]
	method = sys.argv[2] # 5:Sauvola is default (1:Otsu 2:Gaussian 3:Adaptive 4:Niblack 5:Sauvola)
	image = cv2.imread(image_path, 0)

	if  len(np.unique(image)) > 2 or len(image.shape) > 2:

		binarized_image = binarize(image, method)
		cv2.imwrite(image_path, binarized_image)

if __name__ == "__main__":
	main()
	
