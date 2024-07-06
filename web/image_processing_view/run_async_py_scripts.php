<?php

/************************************************************************************************************
 * Runs different image processing algorithms in Python. This is only used in the "image processing view" page.

***************************************************************************************************************/

require_once '../config/config.php';
require_once '../utils_php/utils.php';

$payload_from_frontend = json_decode(file_get_contents('php://input'), true);
$project_id = $payload_from_frontend["project_id"];
$save_id = $payload_from_frontend["save_id"];

$projectDir = "$USER_PROJECTS_ENTRY_POINT/$project_id";
$saveDir = "$projectDir/$save_id";

if(!is_dir($saveDir)){
    http_response_code(400);
    $server_error = new Exception("-------sent 400: bad request, saveDir does not exist: $saveDir");
    log_error_on_server($projectDir, $server_error);
    exit();
}

try {
    $execution_parameters_from_frontend = $payload_from_frontend["execution_parameters_to_server"];

    // we first take the data from the frontend and reconstruct the execution parameters
    // this is a security measure: so that payload would not be saved on server, but only evaluated whenever possible
    $execution_parameters = [];

    $transcription_path = "$saveDir/transcription.json";
    $bounding_boxes_path = "$saveDir/bounding_boxes.json";

    $logFilePath = "$saveDir/log.txt";

    $py_script = "";
    $log_py_name = "";
    $script_key = $execution_parameters_from_frontend["executingScript"];

    if($script_key === "asyncLineSegmentation"){
        $py_script = "datech_line_segmentation.py";
        $log_py_name = "Line segmentation";

        if($execution_parameters_from_frontend["two_segmented_lines"]){
            $execution_parameters["two_segmented_lines"] = true;
        }
        else{
            $execution_parameters["two_segmented_lines"] = false;
        }

        
    }
    else if($script_key === "asyncSegmentation"){
        $py_script = "async_segmentation.py";
        $log_py_name = "Segmentation";

        if(is_int($execution_parameters_from_frontend["minDistLineSeg"]) && $execution_parameters_from_frontend["minDistLineSeg"] >= 1 && $execution_parameters_from_frontend["minDistLineSeg"] <= 500){
            $execution_parameters["minDistLineSeg"] = $execution_parameters_from_frontend["minDistLineSeg"];
        }

        if(is_numeric($execution_parameters_from_frontend["thresLineSeg"]) && $execution_parameters_from_frontend["thresLineSeg"] >= 0.01 && $execution_parameters_from_frontend["thresLineSeg"] <= 1){
            $execution_parameters["thresLineSeg"] = $execution_parameters_from_frontend["thresLineSeg"];
        }

        if(is_int($execution_parameters_from_frontend["thAboveBelowSymbol"]) && $execution_parameters_from_frontend["thAboveBelowSymbol"] >= 1 && $execution_parameters_from_frontend["thAboveBelowSymbol"] <= 100){
            $execution_parameters["thAboveBelowSymbol"] = $execution_parameters_from_frontend["thAboveBelowSymbol"];
        }

        if(is_int($execution_parameters_from_frontend["thSizeCC"]) && $execution_parameters_from_frontend["thSizeCC"] >= 1 && $execution_parameters_from_frontend["thSizeCC"] <= 200){
            $execution_parameters["thSizeCC"] = $execution_parameters_from_frontend["thSizeCC"];
        }

        $boolean_parameters = ["littleSymbol", "topBottomCheck", "leftRightCheck", "insideCheck", "combineLittleSymbols", "permitCollision", "specialSymbols_likely_surrounded"];

        foreach ($boolean_parameters as $index => $param_value) {
            if($execution_parameters_from_frontend[$param_value]){
                $execution_parameters[$param_value] = true;
            }
            else{
                $execution_parameters[$param_value] = false;
            }
        }

    }
    else if($script_key === "asyncClustering"){
        $py_script = "async_kmeans.py";
        $log_py_name = "Clustering";

        if(is_int($execution_parameters_from_frontend["minImages"]) && $execution_parameters_from_frontend["minImages"] >= 1 && $execution_parameters_from_frontend["minImages"] <= 100){
            $execution_parameters["minImages"] = $execution_parameters_from_frontend["minImages"];
        }

        
    }
    else if($script_key === "asyncLabelPropagation"){
        $py_script = "async_label_propagation.py";
        $log_py_name = "Label propagation";

        
        if(is_numeric($execution_parameters_from_frontend["alphaLabelPropagation"]) && $execution_parameters_from_frontend["alphaLabelPropagation"] >= 0.01 && $execution_parameters_from_frontend["alphaLabelPropagation"] <= 1){
            $execution_parameters["alphaLabelPropagation"] = $execution_parameters_from_frontend["alphaLabelPropagation"];
        }

    }
    else{
        http_response_code(400);
        $server_error = new Exception("-------sent 400: bad request, invalid script_key: $script_key");
        log_error_on_server($saveDir, $server_error);
        exit();
    }

    // log the start of the execution
    $startDate = date('Y-m-d H:i:s');
    $log_text_before = "$startDate - $log_py_name starting...\n";
    file_put_contents($logFilePath, $log_text_before, FILE_APPEND);

    // save away the execution parameters
    $parameters_path = "$saveDir/execution_parameters.json";
    file_put_contents($parameters_path, json_encode($execution_parameters));
    chmod($parameters_path, $file_permission);

    $lookup_table_path = "$saveDir/lookup_table.json";

    // create and set the success flag to false, image_processing_wrapper.py will set it to true if the execution is successful (1=success, 0=failure)
    $success_flag_file_path = "$saveDir/success_flag_file.json";
    $success_flag_file["image_processing_success"] = 0;
    file_put_contents($success_flag_file_path, json_encode($success_flag_file));
    
    // construct and execute the command
    $command = "$PYTHON_INTERPRETER image_processing_wrapper.py --code $py_script";
    $command .= " --lookup_table $lookup_table_path --parameters $parameters_path --success_flag $success_flag_file_path --boxes $bounding_boxes_path";
    $command .= " --transcription $transcription_path --user_projects $USER_PROJECTS_ENTRY_POINT 2>&1";

    $ret_val = exec($command, $output); // please be aware of the possibility of command injection

    unlink($parameters_path);
    
    // log the end of the execution
    $log_text_after = "";

    // first get only the success_flag_file.json to see if the execution was successful
    $success_flag_file = json_decode(file_get_contents($success_flag_file_path), true);
    $success_flag = array_key_exists("image_processing_success", $success_flag_file) && $success_flag_file["image_processing_success"] === 1;
    unlink($success_flag_file_path);

    if($success_flag){
        $endDate = date('Y-m-d H:i:s');
        $log_text_after .= "$endDate - $log_py_name finished execution.\n";
        file_put_contents($logFilePath, $log_text_after, FILE_APPEND);
    }
    else{

        $endDate = date('Y-m-d H:i:s');
        $log_text_after .= "$endDate - Something went wrong, $log_py_name failed, please try again.\n";
        file_put_contents($logFilePath, $log_text_after, FILE_APPEND);

        http_response_code(502);
        $output_string = implode(", ", $output);
        $python_error = new Exception("-------sent 502: Python error in $script_key : $output_string");
        log_error_on_server($saveDir, $python_error);
        exit();
    }
    

    $send_to_frontend = [
        "success_flag" => $success_flag,
        "py_output_string" => $output,
        "bounding_boxes" => json_decode(file_get_contents($bounding_boxes_path), true),
        "transcription" => json_decode(file_get_contents($transcription_path), true)
    ];

    echo json_encode($send_to_frontend);
    
} catch (Throwable $error_inside_try) {
    log_error_on_server($saveDir, $error_inside_try);
} 


?>
