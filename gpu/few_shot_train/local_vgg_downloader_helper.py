# ************************************************************************************************************
# For local deployment: triggers the download of the VGG16 model from the torchvision library so that
# the model would be immediately available when the user runs the image processing code.
# 
# ************************************************************************************************************

import torchvision

torchvision.models.vgg16(pretrained=True, progress=False).features

print("Successfully downloaded VGG16 model.")