<?php

/************************************************************************************************************
 * Runs different GPU-enabled image processing algorithms in Python: Few-shot prediction and fine-tuning.
 * This code is the local version of the "run_gpu_python_code.php" and without the logic to handle the
 * remote connection to the GPU server, it is much simpler.
 * This code is only used in the "image processing view" page.

***************************************************************************************************************/

require_once '../config/config.php';
require_once '../utils_php/utils.php';

$payload_from_frontend = json_decode(file_get_contents('php://input'), true);
$project_id = $payload_from_frontend["project_id"];
$save_id = $payload_from_frontend["save_id"];

$projectDir = "$USER_PROJECTS_ENTRY_POINT/$project_id";
$saveDir = "$USER_PROJECTS_ENTRY_POINT/$project_id/$save_id";

if(!is_dir($saveDir)){
    http_response_code(400);
    $server_error = new Exception("-------sent 400: bad request, saveDir does not exist: $saveDir");
    log_error_on_server($projectDir, $server_error);
    exit();
}

try {

    $sessionID = generate_id("$project_id-$save_id");

    // unlike in "run_gpu_python_code.php", we do not reconstruct the execution parameters as a security measure since this code is only for local development
    $execution_parameters = $payload_from_frontend["execution_parameters_to_server"];

    // The "omniglot" model and the other two base models have a different resizing logic built into them.
    // To make sure that the right logic is called in the Python code, we use different naming conventions
    // for these two cases: we include in the model key the "RESIZE_FLAG_" string if the model is "cipherglot-mix" or
    // "cipherglot-separated". This is necessary since we can fine tune models and depending on from which
    // base model did the new model originate from, we need to call the right resizing logic in the Python code.
    $base_models = ["omniglot", "cipherglot-mix", "cipherglot-separated"];
    $execution_parameters["base_models"] = $base_models;

    if(in_array($execution_parameters["selectedModelFewShots"], $base_models)){
        $resize_string = "";
        if($execution_parameters["selectedModelFewShots"] === "cipherglot-mix" || $execution_parameters["selectedModelFewShots"] === "cipherglot-separated"){
            $resize_string = "RESIZE_FLAG_";
        }
        $execution_parameters["new_model_key"] = $execution_parameters["selectedAlphabetFewShots"] . "_$resize_string" . $sessionID;
    }
    else{
        $execution_parameters["new_model_key"] = $execution_parameters["selectedModelFewShots"];
    }

    $bounding_boxes_path = "$saveDir/bounding_boxes.json";
    $transcription_path = "$saveDir/transcription.json";
    $generated_transcription_path = "$saveDir/generated_transcription.json"; // ! This file name is bound to the one in fetch_transcription.php and import_save.php
    
    $bounding_boxes = json_decode(file_get_contents($bounding_boxes_path), true);
    $execution_parameters["array_images"] = array_keys($bounding_boxes["documents"]);

    $lookup_table_path = "$saveDir/lookup_table.json";
    $lookup_table = json_decode(file_get_contents($lookup_table_path), true);

    // prepare logging and other necessary variables for code execution
    $logFilePath = "$saveDir/log.txt";
    $script_key = $execution_parameters["executingScript"];
    $log_py_name = ""; 
    $py_script = "";
    $log_exec_parameters = "";

    if($script_key === "test_few_shot"){ 
        $py_script = "test_few_shot.py";
        $log_py_name = "Few-shot recognition";
        $fewShotReadSpacesBool_string = $execution_parameters["fewShotReadSpacesBool"] ? "yes" : "no";

        // Log parameters to provide feedback to the user.
        $log_exec_parameters .= "\t\t Number of shots = " . $execution_parameters["numberOfShots"] . "\n";
        $log_exec_parameters .= "\t\t Threshold = " . $execution_parameters["thresholdFewShots"] . "\n";
        $log_exec_parameters .= "\t\t Alphabet = " . $execution_parameters["selectedAlphabetFewShots"] . "\n";
        $log_exec_parameters .= "\t\t Model = " . $execution_parameters["selected_model_user_given_name"] . "\n";
        $log_exec_parameters .= "\t\t Read spaces = " . $fewShotReadSpacesBool_string . "\n";
        


    }
    else if($script_key === "few_shot_train"){
        $py_script = "train_few_shot.py";
        $log_py_name = "Few-shot training";
        $fewShotReadSpacesBool_string = $execution_parameters["fewShotReadSpacesBool"] ? "yes" : "no";
        $user_validation_flag_string = $execution_parameters["user_validation_flag"] ? "yes" : "no";

        // Log parameters to provide feedback to the user.
        $log_exec_parameters .= "\t\t Number of shots = " . $execution_parameters["numberOfShots"] . "\n";
        $log_exec_parameters .= "\t\t Threshold = " . $execution_parameters["thresholdFewShots"] . "\n";
        $log_exec_parameters .= "\t\t Epochs = " . $execution_parameters["few_shot_train_epochs"] . "\n";
        $log_exec_parameters .= "\t\t Alphabet = " . $execution_parameters["selectedAlphabetFewShots"] . "\n";
        $log_exec_parameters .= "\t\t Model = " . $execution_parameters["selected_model_user_given_name"] . "\n";
        $log_exec_parameters .= "\t\t Fine tuned model = " . $execution_parameters["few_shot_train_new_model_name"] . "\n";
        $log_exec_parameters .= "\t\t Read spaces = " . $fewShotReadSpacesBool_string . "\n";
        $log_exec_parameters .= "\t\t Validation = " . $user_validation_flag_string . "\n";

        
    }
    else{
        http_response_code(400);
        $server_error = new Exception("-------sent 400: bad request, invalid script_key: $script_key");
        log_error_on_server($saveDir, $server_error);
        exit();
    }

    // create and set the success flag to false, gpu_image_processing_wrapper.py will set it to true if the execution is successful (1=success, 0=failure)
    $success_flag_file_path = "$saveDir/success_flag_file.json";
    $success_flag_file["image_processing_success"] = 0;
    file_put_contents($success_flag_file_path, json_encode($success_flag_file));

    // log the start of the execution
    $startDate = date('Y-m-d H:i:s');
    $log_text_before = "$startDate - $log_py_name starting...\n";
    $log_text_before .= $log_exec_parameters;
    file_put_contents($logFilePath, $log_text_before, FILE_APPEND);

    $parameters_path = "$saveDir/execution_parameters.json";
    file_put_contents($parameters_path, json_encode($execution_parameters));
    chmod($parameters_path, $file_permission);

    // copy the images with the session_id into the same folder so that the gpu_image_processing_wrapper.py would find them
    // so here a local copying happens instead of a remote one of "run_gpu_python_code.php"
    $list_of_files_to_send = $execution_parameters["array_images"];

    foreach ($execution_parameters["array_images"] as $i => $value) {
            copy("$saveDir/$value", "$saveDir/$sessionID-$value");
            chmod("$saveDir/$sessionID-$value", $file_permission);
        }

    $saveDirGPU = "$gpu_server_folder_path/../user_projects/$project_id/$save_id";
    $gpu_server_lookup_table_path = "$saveDirGPU/lookup_table.json";
    $gpu_server_parameters_path = "$saveDirGPU/execution_parameters.json";
    $gpu_server_success_flag_path = "$saveDirGPU/success_flag_file.json";
    $gpu_server_bounding_boxes_path = "$saveDirGPU/bounding_boxes.json";
    $gpu_server_transcription_path = "$saveDirGPU/transcription.json";
    $gpu_server_generated_transcription_path = "$saveDirGPU/generated_transcription.json";

    // construct and execute the command
    $command = "$FEW_SHOT_TRAIN_PYTHON_INTERPRETER $gpu_server_folder_path/gpu_image_processing_wrapper.py --code $py_script --lookup_table $gpu_server_lookup_table_path";
    $command .= " --parameters $gpu_server_parameters_path --success_flag $gpu_server_success_flag_path --boxes $gpu_server_bounding_boxes_path --transcription $gpu_server_transcription_path";
    $command .= " --generated_transcription $gpu_server_generated_transcription_path --working_dir $saveDirGPU --sessionID $sessionID --suffix $suffix 2>&1";

    $ret_val = exec($command, $output);

    unlink($parameters_path);

    $project_lookup_table_path = "$projectDir/project_lookup_table.json";
    $project_lookup_table = json_decode(file_get_contents($project_lookup_table_path), true);

    $log_text_after = "";

    // first get only the success_flag_file.json to see if the execution was successful
    $success_flag_file = json_decode(file_get_contents($success_flag_file_path), true);
    $success_flag = array_key_exists("image_processing_success", $success_flag_file) && $success_flag_file["image_processing_success"] === 1;
    unlink($success_flag_file_path);

    // adjust lookup table if the execution was successful
    if($success_flag){

        if($script_key === "few_shot_train"){

            // add new model into lookup table
            if(!array_key_exists($execution_parameters["new_model_key"], $project_lookup_table["fine_tuned_model_name_mapping"])){
                $project_lookup_table["fine_tuned_model_name_mapping"][$execution_parameters["new_model_key"]] = $execution_parameters["few_shot_train_new_model_name"];
                file_put_contents($project_lookup_table_path, json_encode($project_lookup_table));
            }
        }

    }
    else{
        // in case of unsuccessful execution, we add a log entry and send a 502 error
        $endDate = date('Y-m-d H:i:s');
        $log_text_after .= "$endDate - Something went wrong, $log_py_name failed, please try again.\n";
        file_put_contents($logFilePath, $log_text_after, FILE_APPEND);

        http_response_code(502);
        $output_string = implode(", ", $output);
        $python_error = new Exception("-------sent 502: Python error in $script_key : $output_string");
        log_error_on_server($saveDir, $python_error);
        exit();
        
    }

    // in case of successful execution, we add a log entry, save the new data and send it back to the frontend
    $out_bounding_boxes_path = "$saveDir/bounding_boxes$suffix.json";
    $out_transcription_path = "$saveDir/transcription$suffix.json";
    $out_generated_transcription_path = "$saveDir/generated_transcription$suffix.json"; // ! This file name is bound to the one in fetch_transcription.php and import_save.php
    $out_lookup_table_path = "$saveDir/lookup_table$suffix.json";
    $out_lookup_table = json_decode(file_get_contents($out_lookup_table_path), true);

    if($script_key === "few_shot_train" && array_key_exists("user_validation_flag", $execution_parameters) && $execution_parameters["user_validation_flag"] === 1){
        if (array_key_exists("cer", $out_lookup_table)){
            $cer_logs = $out_lookup_table["cer"];
            $log_text_after .= "$cer_logs";
        }
        else{
            $log_text_after .= "Character Error Rate is unfortunately missing.\n";
        }
    }
    
    $bounding_boxes = json_decode(file_get_contents($out_bounding_boxes_path), true);
    $transcription = json_decode(file_get_contents($out_transcription_path), true);
    if(file_exists($out_generated_transcription_path)){
        $generated_transcription = json_decode(file_get_contents($out_generated_transcription_path), true);
        file_put_contents($generated_transcription_path, json_encode($generated_transcription));
    }
    else{
        $generated_transcription = [];
    }

    file_put_contents($bounding_boxes_path, json_encode($bounding_boxes));
    file_put_contents($transcription_path, json_encode($transcription));

    $endDate = date('Y-m-d H:i:s');
    $log_text_after .= "$endDate - $log_py_name finished execution.\n";
    file_put_contents($logFilePath, $log_text_after, FILE_APPEND);

    $send_to_frontend = [
        "success_flag" => $success_flag,
        "bounding_boxes" => $bounding_boxes,
        "transcription" => $transcription,
        "generated_transcription" => $generated_transcription,
        "project_lookup_table" => $project_lookup_table
    ];

    echo json_encode($send_to_frontend);
    
} catch (Throwable $error_inside_try) {
    
    log_error_on_server($saveDir, $error_inside_try);

} 


?>
