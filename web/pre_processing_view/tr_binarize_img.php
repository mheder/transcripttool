<?php

/************************************************************************************************************
 * Binarizes an image using a Python script. This is only used in the "pre-processing view" page.

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
    
    $currentImageName = $payloadFromServer["currentImageName"];

    if(!is_file("$saveDir/$currentImageName")){
        http_response_code(400);
        $server_error = new Exception("-------sent 400: bad request, currentImageName file does not exist: $currentImageName");
        log_error_on_server($saveDir, $server_error);
        exit();
    }

    // we make sure that the binarization method will be one of the following
    $possible_alphabets = ["Otsu", "Gaussian", "Adaptive", "Niblack", "Sauvola"];

    if(is_string($payloadFromServer["selectedBinarizationMethod"]) && in_array($payloadFromServer["selectedBinarizationMethod"], $possible_alphabets)){
        $binMethod = $payloadFromServer["selectedBinarizationMethod"];
    }

    $py_script_path = "binarize.py";

    // execute the python script to binarize the image
    $command = "$PYTHON_INTERPRETER $py_script_path $saveDir/$currentImageName $binMethod 2>&1";
    $ret_val = exec($command, $output); // double check for security issues: command injection

    $send_to_frontend = [
        "output" => $output,
        "return_var" => $ret_val
    ];

    echo json_encode($send_to_frontend);
    
} catch (Throwable $error_inside_try) {
    log_error_on_server($saveDir, $error_inside_try);
} 

?>
