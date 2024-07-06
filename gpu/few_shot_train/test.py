# ************************************************************************************************************
# Few-shot prediction code. We predict based on the data provided by the user on
# the frontend. Takes as input lines, outputs the predicted symbols and their transcription.
# Please note that you can run this both by CPU and GPU.
# 
# ************************************************************************************************************

import os
import torch
import torchvision
from few_shot_train.src.faster_rcnn import FastRCNNPredictor, TwoMLPHead
import torchvision
from few_shot_train.src.faster_rcnn import FasterRCNN
from few_shot_train.src.rpn import AnchorGenerator
import torchvision
import few_shot_train.src.transforms as T 

import few_shot_train.htr_utils as htr_utils
import traceback

def get_transform(train):
    transforms = []
    transforms.append(T.ToTensor())
    if train:
        transforms.append(T.RandomHorizontalFlip(0.5))
    return T.Compose(transforms)


def init_model(device, model_path):
    """
    Initialize a Few-shot model.

    Args:
        device (torch.device): The device to use for model computation. CPU or GPU.
        model_path (str): The path to the saved model weights.

    Returns:
        model (torch.nn.Module): The initialized Faster R-CNN model.
    """
    num_classes = 2
    backbone = torchvision.models.vgg16(pretrained=True, progress=False).features
    backbone.out_channels = 512

    anchor_generator = AnchorGenerator(sizes=((32, 64, 128, 256, 512),),
                                    aspect_ratios=((0.5, 1.0, 2.0),))
    roi_ouput_size = 7
    roi_pooler = torchvision.ops.MultiScaleRoIAlign(featmap_names=[0],
                                                    output_size=roi_ouput_size,
                                                    sampling_ratio=2)
    model = FasterRCNN(backbone,
                    num_classes=num_classes,
                    rpn_anchor_generator=anchor_generator,
                    box_roi_pool=roi_pooler, device=device)

    backbone_output_size = 512

    in_channels = 512
    in_channels2 = backbone_output_size*roi_ouput_size**2


    model.roi_heads.box_predictor = FastRCNNPredictor(in_channels, num_classes)
    model.roi_heads.box_head = TwoMLPHead(in_channels2, in_channels)

    model.load_state_dict(torch.load(model_path, map_location=device))

    model.to(device)

    return model


def run_recognition(cipher, alphabet_path, SHOTS, THRESHOLD, READ_SPACES, data_path, model_path, log_path, resizing_flag, device):

    model = init_model(device, model_path)

    draw_and_read = htr_utils.draw_and_read
    zid_read = htr_utils.zid_read
    inttosymbs = htr_utils.inttosymbs
    
    list_lines = sorted(os.listdir(os.path.join(data_path, cipher))) # gets the input lines
    results = draw_and_read(model, device, alphabet_path, resizing_flag, THRESHOLD, list_lines, data_path,cipher,SHOTS, log_path) # Few-shot prediction
    predictions, pred_boxes  = zid_read(THRESHOLD, results, READ_SPACES) # Post-processing
    pred_lines, fixed_alphabet = inttosymbs(alphabet_path, predictions, cipher) # Post-processing

    return list_lines, pred_boxes, predictions, pred_lines, fixed_alphabet


def main(cipher, alphabet_path, SHOTS, THRESHOLD, READ_SPACES, data_path, model_path, log_path, resizing_flag, device=torch.device('cpu')):

    # ! change working dir to the one containing this code
    os.chdir(os.path.dirname(__file__))

    error_message = None
    list_lines = None
    pred_boxes = None
    predictions = None
    pred_lines = None
    fixed_alphabet = None

    try:
        list_lines, pred_boxes, predictions, pred_lines, fixed_alphabet = run_recognition(cipher,
                alphabet_path, SHOTS, THRESHOLD, READ_SPACES, data_path, model_path, log_path, resizing_flag, device
        )
        
    except:
        error_message = traceback.format_exc()


    return error_message, list_lines, pred_boxes, predictions, pred_lines, fixed_alphabet


if __name__ == "__main__":
    main()