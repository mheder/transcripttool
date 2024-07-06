# ************************************************************************************************************
# Few-shot training (or fine-tuning) code. We run the training on the data provided by the user on
# the frontend. Takes as input symbols and their transcription, outputs the trained model weights.
# Please note that you need a GPU to run this code.
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
from few_shot_train.src.engine import train_one_epoch
from few_shot_train.load_data import load_data
import few_shot_train.htr_utils as htr_utils

import traceback, time

def get_gt(list_lines, val_text_path, cipher, alphabet_path):
    gt = []
    for x in list_lines[:]:
        f = open(val_text_path+cipher+'/'+x.split('.jpg')[0]+'.txt', "r")
        line = (f.read())
        f.close()

        gt.append(txt_to_int(line, alphabet_path, cipher))
    return gt


def txt_to_int(text, alphabet_path, cipher):
    res = []
    alpha_f = os.listdir(alphabet_path+'/'+cipher)
    text= text.split('\n')[0]
    text = text.split(' ')
    for c in text:
        if c not in alpha_f: 
            res.append(-3)   # if you want to ignore out of vocab symbols make it continue
        elif c == 'space':
            res.append(-2)
        else:
            res.append(alpha_f.index(c))
    return (res)


def init_model(device, TRAIN_TYPE, model_path):
    """
    Initialize the model for training.

    Args:
        device (torch.device): The device to use for training. Can only be GPU.
        TRAIN_TYPE (str): The type of training ('fine_tune' or 'scratch'). We actually only use "fine_tune".
        model_path (str): The path to the pre-trained model weights.

    Returns:
        model (torch.nn.Module): The initialized model.
        optimizer (torch.optim.Optimizer): The optimizer for training the model.
    """
    num_classes = 2

    backbone = torchvision.models.vgg16(pretrained=True).features
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

    model.to(device)

    params = [p for p in model.parameters() if p.requires_grad]
    optimizer = torch.optim.SGD(params, lr=0.005,
                                momentum=0.9, weight_decay=0.0005)

    if TRAIN_TYPE == 'fine_tune':
        model.load_state_dict(torch.load(model_path, map_location=device))

    return model, optimizer


def run_train(user_validation_flag, resizing_flag, cipher, alphabet_path, BATCH_SIZE, SHOTS, THRESHOLD,
                TRAIN_TYPE, root, val_data_path, number_of_epochs, model_path, new_model_path, log_path, lookup_table, device):

    draw_and_read = htr_utils.draw_and_read
    zid_read = htr_utils.zid_read
    get_error_rate = htr_utils.get_error_rate

    root_txt = os.path.join(root, 'annotation/train.txt')
    val_lines_path = os.path.join(val_data_path, 'lines/')
    val_text_path  = os.path.join(val_data_path, 'gt/')

    model, optimizer = init_model(device, TRAIN_TYPE, model_path)

    best_cer = 2 # ! has to be more than 1 because a training without validation set will produce a cer=1
    dataset, data_loader = load_data(BATCH_SIZE,SHOTS,root, alphabet_path, cipher, resizing_flag, root_txt)


    print_fr = int(len(dataset)/BATCH_SIZE/4)

    accumulated_cer_log = "Character Error Rate (CER):\n"

    # training here
    for epoch in range(0, number_of_epochs):

        with open(log_path,"a") as file:
            file.write('{} Epoch: {}/{} \n'.format(time.strftime("%Y.%m.%d-%H.%M.%S"), epoch+1, number_of_epochs))

        train_one_epoch(model, optimizer, data_loader, device, epoch, print_fr, log_path)

        # run validation if the user selected this option
        # otherwise only save the model
        if epoch >-1 and user_validation_flag:
            
            list_lines = os.listdir(os.path.join(val_lines_path, cipher))

            # run Few-shot prediction on the validation data
            results = draw_and_read(model, device, alphabet_path, resizing_flag, THRESHOLD, list_lines,val_lines_path,cipher,SHOTS, log_path)
            gt = get_gt(list_lines, val_text_path, cipher, alphabet_path)
            predictions  = zid_read(THRESHOLD, results)[0]

            cer = get_error_rate(gt, predictions)[0]
            
            # log character error rate for the user
            with open(log_path,"a") as file:
                cer_print = round(cer, 3)
                file.write('Character Error Rate (CER):{} \n ------- \n'.format(cer_print))
                epoch_number = epoch+1
                accumulated_cer_log += f"Epoch {epoch_number} - CER: {cer_print}\n"

            if cer<best_cer:
                best_cer = cer
                torch.save(model.state_dict(), new_model_path)
        else:
            torch.save(model.state_dict(), new_model_path)

    if user_validation_flag:
        lookup_table["cer"] = accumulated_cer_log # we just overwrite it

    return lookup_table


def main(user_validation_flag, resizing_flag, cipher, alphabet_path, BATCH_SIZE, SHOTS, THRESHOLD, TRAIN_TYPE, root, val_data_path, number_of_epochs,
            model_path, new_model_path, log_path, lookup_table, device=torch.device('cpu')):

    # ! change working dir to the one containing this code
    os.chdir(os.path.dirname(__file__))

    error_message = None

    try:
        lookup_table = run_train(user_validation_flag, resizing_flag, cipher, alphabet_path, BATCH_SIZE, SHOTS, THRESHOLD,
            TRAIN_TYPE, root, val_data_path, number_of_epochs, model_path, new_model_path,
            log_path, lookup_table, device
        )
        
    except:
        error_message = traceback.format_exc()


    return error_message, lookup_table


if __name__ == "__main__":
    main()