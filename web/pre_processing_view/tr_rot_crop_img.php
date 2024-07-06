<?php

/************************************************************************************************************
 * Crops and rotates an image (jpg or png). This is only used in the "pre-processing view" page.

***************************************************************************************************************/

require_once '../config/config.php';
require_once '../utils_php/utils.php';

$payloadFromServer = json_decode(file_get_contents('php://input'), true);
$project_id = $payloadFromServer["project_id"];
$save_id = $payloadFromServer["save_id"];

$projectDir = "$USER_PROJECTS_ENTRY_POINT/$project_id";
$saveDir = "$projectDir/$save_id";

if(!is_dir($saveDir)){
    http_response_code(400);
    $server_error = new Exception("-------sent 400: bad request, saveDir does not exist: $saveDir");
    log_error_on_server($projectDir, $server_error);
    exit();
}

try {

    $imageName = $payloadFromServer["currentImageName"];
    $current_img_path = "$saveDir/$imageName";
    $helper_left = $payloadFromServer["left"];
    $helper_top = $payloadFromServer["top"];
    $helper_width = $payloadFromServer["width"];
    $helper_height = $payloadFromServer["height"];

    //find the original image size
    $img_size = getimagesize($current_img_path);
    $width = $img_size[0];
    $height = $img_size[1];
    $type = $img_size[2];

    $rot_ang = -$payloadFromServer["rot"]; //"-" because php rotates counter clockwise

    if($type == IMAGETYPE_JPEG) {
        $im = imagecreatefromjpeg($current_img_path);
        $black_bg = imagecolorallocatealpha($im, 0, 0, 0, 0);
        $im2 = imagerotate($im, $rot_ang, $black_bg);
        $im3 = imagecrop($im2, ['x' => $helper_left * $width, 'y' => $helper_top * $height,
        'width' => $helper_width * $width, 'height' => $helper_height * $height]);

        imagejpeg($im3, $current_img_path);   
        chmod($current_img_path, $file_permission);
        
    }
    elseif($type == IMAGETYPE_PNG){
        $im = imagecreatefrompng($current_img_path);
        $black_bg = imagecolorallocatealpha($im, 0, 0, 0, 0);
        $im2 = imagerotate($im, $rot_ang, $black_bg);
        $im3 = imagecrop($im2, ['x' => $helper_left * $width, 'y' => $helper_top * $height,
        'width' => $helper_width * $width, 'height' => $helper_height * $height]);
        
        imagepng($im3, $current_img_path);
        chmod($current_img_path, $file_permission);

    }
    else {
        throw new Exception("Error: no such image type is supported.");
    }

    imagedestroy($im3);
    imagedestroy($im2);
    imagedestroy($im);


    echo json_encode("successful rotation and cropping");

} catch (Throwable $error_inside_try) {
    log_error_on_server($saveDir, $error_inside_try);
} 

?>
