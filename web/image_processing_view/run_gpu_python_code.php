<?php

/************************************************************************************************************
 * Runs different GPU-enabled image processing algorithms in Python: Few-shot prediction and fine-tuning.
 * This code connects to a remote GPU server through SSH. As such it contains the logic to send and receive
 * files from the GPU server. It also constructs and executes the Bash command running Python remotely on
 * the GPU server. It handles different error cases related to this remote connection: timeout, failure in
 * sending or receiving files, and failure in the Python code execution. It also sets some entries in the
 * lookup table ("GPU_server_result_transmission") to indicate the state of the execution, so that even if this
 * code times out (automatically after 1 hour) a successfully executed session would not be lost, but could be
 * retrieved by the "sync_files_from_GPU_server" function in the "index.php" when the user loads in the
 * "project view" page.
 * This code is only used in the "image processing view" page.

***************************************************************************************************************/

require_once '../config/config.php';
require_once '../utils_php/utils.php';

$payload_from_frontend = json_decode(file_get_contents('php://input'), true);
$project_id = $payload_from_frontend["project_id"];
$save_id = $payload_from_frontend["save_id"];

$saveDir = "$USER_PROJECTS_ENTRY_POINT/$project_id/$save_id";
$project_dir = "$USER_PROJECTS_ENTRY_POINT/$project_id";

if(!is_dir($saveDir)){
    http_response_code(400);
    $server_error = new Exception("-------sent 400: bad request, saveDir does not exist: $saveDir");
    log_error_on_server($projectDir, $server_error);
    exit();
}

try {

    $sessionID = generate_id("$project_id-$save_id");

    $execution_parameters_from_frontend = $payload_from_frontend["execution_parameters_to_server"];
    $script_key = $execution_parameters_from_frontend["executingScript"];

    $bounding_boxes_path = "$saveDir/bounding_boxes.json";
    $transcription_path = "$saveDir/transcription.json";
    $generated_transcription_path = "$saveDir/generated_transcription.json"; // ! This file name is bound to the one in fetch_transcription.php and import_save.php

    $bounding_boxes = json_decode(file_get_contents($bounding_boxes_path), true);

    // we first take the data from the frontend and reconstruct the execution parameters
    // this is a security measure: so that payload would not be saved on server, but only evaluated whenever possible
    $execution_parameters = [];

    if($script_key === "test_few_shot"){

        if(is_int($execution_parameters_from_frontend["numberOfShots"]) && $execution_parameters_from_frontend["numberOfShots"] >= 1 && $execution_parameters_from_frontend["numberOfShots"] <= 5){
            $execution_parameters["numberOfShots"] = $execution_parameters_from_frontend["numberOfShots"];
        }

        if(is_numeric($execution_parameters_from_frontend["thresholdFewShots"]) && $execution_parameters_from_frontend["thresholdFewShots"] >= 0.01 && $execution_parameters_from_frontend["thresholdFewShots"] <= 1){
            $execution_parameters["thresholdFewShots"] = $execution_parameters_from_frontend["thresholdFewShots"];
        }

        $possible_alphabets = ["borg", "copiale", "vatican", "runic", "ramanacoil"];

        if(is_string($execution_parameters_from_frontend["selectedAlphabetFewShots"]) && in_array($execution_parameters_from_frontend["selectedAlphabetFewShots"], $possible_alphabets)){
            $execution_parameters["selectedAlphabetFewShots"] = $execution_parameters_from_frontend["selectedAlphabetFewShots"];
        }

        if(is_string($execution_parameters_from_frontend["selectedModelFewShots"])){
            $execution_parameters["selectedModelFewShots"] = $execution_parameters_from_frontend["selectedModelFewShots"];
        }

        if(is_string($execution_parameters_from_frontend["selected_model_user_given_name"])){
            $execution_parameters["selected_model_user_given_name"] = $execution_parameters_from_frontend["selected_model_user_given_name"];
        }

        if($execution_parameters_from_frontend["fewShotReadSpacesBool"] === 1){
            $execution_parameters["fewShotReadSpacesBool"] = 1;
        }
        else{
            $execution_parameters["fewShotReadSpacesBool"] = 0;
        }

        $execution_parameters["array_images"] = array_keys($bounding_boxes["documents"]);

        
    }
    else if($script_key === "few_shot_train"){

        if($execution_parameters_from_frontend["user_validation_flag"] === 1){
            $execution_parameters["user_validation_flag"] = 1;
        }
        else{
            $execution_parameters["user_validation_flag"] = 0;
        }

        if(is_int($execution_parameters_from_frontend["numberOfShots"]) && $execution_parameters_from_frontend["numberOfShots"] >= 1 && $execution_parameters_from_frontend["numberOfShots"] <= 5){
            $execution_parameters["numberOfShots"] = $execution_parameters_from_frontend["numberOfShots"];
        }

        if(is_numeric($execution_parameters_from_frontend["thresholdFewShots"]) && $execution_parameters_from_frontend["thresholdFewShots"] >= 0.01 && $execution_parameters_from_frontend["thresholdFewShots"] <= 1){
            $execution_parameters["thresholdFewShots"] = $execution_parameters_from_frontend["thresholdFewShots"];
        }

        $possible_alphabets = ["borg", "copiale", "vatican", "runic", "ramanacoil"];

        if(is_string($execution_parameters_from_frontend["selectedAlphabetFewShots"]) && in_array($execution_parameters_from_frontend["selectedAlphabetFewShots"], $possible_alphabets)){
            $execution_parameters["selectedAlphabetFewShots"] = $execution_parameters_from_frontend["selectedAlphabetFewShots"];
        }

        if(is_string($execution_parameters_from_frontend["selectedModelFewShots"])){
            $execution_parameters["selectedModelFewShots"] = $execution_parameters_from_frontend["selectedModelFewShots"];
        }

        if(is_string($execution_parameters_from_frontend["selected_model_user_given_name"])){
            $execution_parameters["selected_model_user_given_name"] = $execution_parameters_from_frontend["selected_model_user_given_name"];
        }

        if(is_string($execution_parameters_from_frontend["few_shot_train_new_model_name"])){
            $execution_parameters["few_shot_train_new_model_name"] = $execution_parameters_from_frontend["few_shot_train_new_model_name"];
        }

        if(is_int($execution_parameters_from_frontend["few_shot_train_epochs"]) && $execution_parameters_from_frontend["few_shot_train_epochs"] >= 1 && $execution_parameters_from_frontend["few_shot_train_epochs"] <= 20){
            $execution_parameters["few_shot_train_epochs"] = $execution_parameters_from_frontend["few_shot_train_epochs"];
        }

        if($execution_parameters_from_frontend["fewShotReadSpacesBool"] === 1){
            $execution_parameters["fewShotReadSpacesBool"] = 1;
        }
        else{
            $execution_parameters["fewShotReadSpacesBool"] = 0;
        }

        $execution_parameters["array_images"] = array_keys($bounding_boxes["documents"]);

    }
    else{
        http_response_code(400);
        $server_error = new Exception("-------sent 400: bad request, invalid script_key: $script_key");
        log_error_on_server($saveDir, $server_error);
        exit();
    }

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
    
    $lookup_table_path = "$saveDir/lookup_table.json";
    $lookup_table = json_decode(file_get_contents($lookup_table_path), true);

    // Complete if the entry is missing from the lookup table for backward compatibility.
    // This is the default state of this "GPU_server_result_transmission" entry of the lookup table.
    if(!array_key_exists("GPU_server_result_transmission", $lookup_table)){
        // ! Duplicate of template_lookup_table.json
        $lookup_table["GPU_server_result_transmission"] = [
            "few_shot_recognition" => [
                "finished" => 1,
                "session_id" => ""
            ],
            "few_shot_training" => [
                "finished" => 1,
                "session_id" => "",
                "model_key" => "",
                "model_name" => ""
            ]
        ];
    }

    // prepare logging, lookup table and other necessary variables for code execution
    $logFilePath = "$saveDir/log.txt";
    $log_py_name = ""; 
    $py_script = "";
    $py_interpreter = "";
    $log_exec_parameters = "";

    if($script_key === "test_few_shot"){ 
        $py_script = "test_few_shot.py";
        $log_py_name = "Few-shot recognition";
        # Change 1 to 0 (by default it is 1) to indicate that the code started and so far its result has not been transferred back to this server.
        $lookup_table["GPU_server_result_transmission"]["few_shot_recognition"]["finished"] = 0; 
        $lookup_table["GPU_server_result_transmission"]["few_shot_recognition"]["session_id"] = $sessionID;
        $py_interpreter = $FEW_SHOT_TRAIN_PYTHON_INTERPRETER;

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
        # Change 1 to 0 (by default it is 1) to indicate that the code started and so far its result has not been transferred back to this server.
        $lookup_table["GPU_server_result_transmission"]["few_shot_training"]["finished"] = 0;
        $lookup_table["GPU_server_result_transmission"]["few_shot_training"]["session_id"] = $sessionID;
        $lookup_table["GPU_server_result_transmission"]["few_shot_training"]["model_key"] = $execution_parameters["new_model_key"];
        $lookup_table["GPU_server_result_transmission"]["few_shot_training"]["model_name"] = $execution_parameters["few_shot_train_new_model_name"];
        $py_interpreter = $FEW_SHOT_TRAIN_PYTHON_INTERPRETER;

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

    file_put_contents($lookup_table_path, json_encode($lookup_table));

    // log the start of the execution
    $startDate = date('Y-m-d H:i:s');
    $log_text_before = "$startDate - $log_py_name starting...\n";
    $log_text_before .= $log_exec_parameters;
    file_put_contents($logFilePath, $log_text_before, FILE_APPEND);

    // connect to the GPU server through SSH
    $connection = ssh2_connect($ssh_connection_hostname, $ssh_connection_port);
    ssh2_auth_pubkey_file(
        $connection,
        $ssh_connection_user,
        $pub_key,
        $priv_key,
        ''
    );

    // create and set the success flag to false, gpu_image_processing_wrapper.py will set it to true if the execution is successful (1=success, 0=failure)
    $success_flag_file_path = "$saveDir/success_flag_file.json";
    $success_flag_file["image_processing_success"] = 0;
    file_put_contents($success_flag_file_path, json_encode($success_flag_file));

    // save away the execution parameters and send the necessary files to the GPU server
    $parameters_path = "$saveDir/execution_parameters.json";
    file_put_contents($parameters_path, json_encode($execution_parameters));
    chmod($parameters_path, $file_permission);

    $list_of_files_to_send = $execution_parameters["array_images"];
    $list_of_files_to_send[] = "bounding_boxes.json";
    $list_of_files_to_send[] = "transcription.json"; 
    $list_of_files_to_send[] = "lookup_table.json";
    $list_of_files_to_send[] = "execution_parameters.json";
    $list_of_files_to_send[] = "success_flag_file.json";

    if(is_file($generated_transcription_path)){
        $list_of_files_to_send[] = "generated_transcription.json";
    }

    foreach ($list_of_files_to_send as $i => $value) {
        $ret_val = ssh2_scp_send($connection, "$saveDir/$value", "$gpu_server_folder_path/temp/$sessionID-$value", $file_permission);
        if(!$ret_val){
            http_response_code(502);
            $send_error = new Exception("-------sent 502: some files could not be sent to the GPU server, ret_val: $ret_val");
            log_error_on_server($saveDir, $send_error);
            ssh2_disconnect($connection);
        }
    }

    // construct and execute remotely the command
    $gpu_server_lookup_table_path = "$gpu_server_folder_path/temp/$sessionID-lookup_table.json";
    $gpu_server_parameters_path = "$gpu_server_folder_path/temp/$sessionID-execution_parameters.json";
    $gpu_server_success_flag_path = "$gpu_server_folder_path/temp/$sessionID-success_flag_file.json";
    $gpu_server_bounding_boxes_path = "$gpu_server_folder_path/temp/$sessionID-bounding_boxes.json";
    $gpu_server_transcription_path = "$gpu_server_folder_path/temp/$sessionID-transcription.json";
    $gpu_server_generated_transcription_path = "$gpu_server_folder_path/temp/$sessionID-generated_transcription.json";
    $gpu_server_working_dir = "$gpu_server_folder_path/temp";

    $command = "$py_interpreter $gpu_server_folder_path/gpu_image_processing_wrapper.py --code $py_script --lookup_table $gpu_server_lookup_table_path";
    $command .= " --parameters $gpu_server_parameters_path --success_flag $gpu_server_success_flag_path --boxes $gpu_server_bounding_boxes_path --transcription $gpu_server_transcription_path";
    $command .= " --generated_transcription $gpu_server_generated_transcription_path --sessionID $sessionID --working_dir $gpu_server_working_dir --suffix $suffix 2>&1";

    $stream = ssh2_exec($connection, $command);
    stream_set_blocking($stream, true);
    $stdio_stream = ssh2_fetch_stream($stream, SSH2_STREAM_STDIO);
    stream_set_timeout($stdio_stream, $timeout);
    $output = stream_get_contents($stdio_stream);

    log_error_on_server($saveDir, new Exception("Python output: $output"));

    // to catch the timeout warning
    set_error_handler(function($errno, $errstr, $errfile, $errline) {
        throw new Exception($errstr);
    });

    try {
        $output = stream_get_contents($stdio_stream);
    } catch (Exception $e) {
        // Handle the timeout warning here
        http_response_code(504);
        $error_504 = new Exception("-------sent 504: py exec timed out.");
        log_error_on_server($saveDir, $error_504);
        ssh2_disconnect($connection);
        exit();
    }
    
    // restore the previous error handler
    restore_error_handler();


    $project_lookup_table_path = "$project_dir/project_lookup_table.json";
    $project_lookup_table = json_decode(file_get_contents($project_lookup_table_path), true);

    unlink($parameters_path);

    $log_text_after = "";

    // first retrieve only the success_flag_file.json to see if the execution was successful
    $if_receive_false = true;
    $if_receive_false = ssh2_scp_recv($connection, "$gpu_server_folder_path/temp/$sessionID-success_flag_file.json", $success_flag_file_path);
    
    // if the lookup table is missing, we send a 500 error
    if (!$if_receive_false) {
        http_response_code(500);
        $error_500 = new Exception("-------sent 500: ssh2_scp_recv() did not find the result files on the gpu server.");
        log_error_on_server($saveDir, $error_500);
        ssh2_disconnect($connection);
        exit();
    }

    // retrieve data from the GPU server if the execution was successful
    $success_flag_file = json_decode(file_get_contents($success_flag_file_path), true);
    unlink($success_flag_file_path);
    $success_flag = array_key_exists("image_processing_success", $success_flag_file) && $success_flag_file["image_processing_success"] === 1;
    
    if($success_flag){

        $tmp_lookup_table_path = "$saveDir/tmp_lookup_table.json";

        $if_any_receive_false = true;
        $if_any_receive_false = $if_any_receive_false && ssh2_scp_recv($connection, "$gpu_server_folder_path/temp/$sessionID-bounding_boxes$suffix.json", $bounding_boxes_path);
        chmod($bounding_boxes_path, $file_permission);
        $if_any_receive_false = $if_any_receive_false && ssh2_scp_recv($connection, "$gpu_server_folder_path/temp/$sessionID-transcription$suffix.json", $transcription_path);
        chmod($transcription_path, $file_permission);
        $if_any_receive_false = $if_any_receive_false && ssh2_scp_recv($connection, "$gpu_server_folder_path/temp/$sessionID-generated_transcription$suffix.json", $generated_transcription_path);
        chmod($generated_transcription_path, $file_permission);
        $if_any_receive_false = $if_any_receive_false && ssh2_scp_recv($connection, "$gpu_server_folder_path/temp/$sessionID-lookup_table$suffix.json", $tmp_lookup_table_path);
        chmod($tmp_lookup_table_path, $file_permission);

        $tmp_lookup_table = json_decode(file_get_contents($tmp_lookup_table_path), true);
        unlink($tmp_lookup_table_path);
        
        // if any file is missing, we send a 500 error
        if (!$if_any_receive_false) {
            http_response_code(500);
            $error_500 = new Exception("-------sent 500: ssh2_scp_recv() did not find the result files on the gpu server.");
            log_error_on_server($saveDir, $error_500);
            ssh2_disconnect($connection);
            exit();
        }

        // Changing only this specific part of the lookup_table.json so that no other part - which could have been changed
        // in the meantime - would be overwritten with (possibly) obsolete information.
        $lookup_table = json_decode(file_get_contents($lookup_table_path), true);
        $lookup_table["GPU_server_result_transmission"] = $tmp_lookup_table["GPU_server_result_transmission"];
        
        # Log the CER if user enabled validation.
        if($script_key === "few_shot_train" && array_key_exists("user_validation_flag", $execution_parameters) && $execution_parameters["user_validation_flag"] === 1){
            if (array_key_exists("cer", $tmp_lookup_table)){
                $cer_logs = $tmp_lookup_table["cer"];
                $log_text_after .= "$cer_logs";
            }
            else{
                $log_text_after .= "Character Error Rate is unfortunately missing.\n";
            }
        }
        

        // in case of successful execution, we reset the "GPU_server_result_transmission" entry in the lookup table
        if($script_key === "test_few_shot" && $lookup_table["GPU_server_result_transmission"]["few_shot_recognition"]["finished"] === 1){

            $lookup_table["GPU_server_result_transmission"]["few_shot_recognition"]["session_id"] = "";

        }
        else if($script_key === "few_shot_train" && $lookup_table["GPU_server_result_transmission"]["few_shot_training"]["finished"] === 1){

            $lookup_table["GPU_server_result_transmission"]["few_shot_training"]["session_id"] = "";
            $lookup_table["GPU_server_result_transmission"]["few_shot_training"]["model_key"] = "";
            $lookup_table["GPU_server_result_transmission"]["few_shot_training"]["model_name"] = "";

            // add new model into lookup table
            if(!array_key_exists($execution_parameters["new_model_key"], $project_lookup_table["fine_tuned_model_name_mapping"])){
                $project_lookup_table["fine_tuned_model_name_mapping"][$execution_parameters["new_model_key"]] = $execution_parameters["few_shot_train_new_model_name"];
                file_put_contents($project_lookup_table_path, json_encode($project_lookup_table));
            }
        }
        else{
            // ! Not handled here, already handled above the case of incorrect code call.
        }

        file_put_contents($lookup_table_path, json_encode($lookup_table));


    }
    else{

        // in case of unsuccessful execution, we add a log entry and send a 502 error
        $endDate = date('Y-m-d H:i:s');
        $log_text_after .= "$endDate - Something went wrong, $log_py_name failed, please try again.\n";
        file_put_contents($logFilePath, $log_text_after, FILE_APPEND);

        http_response_code(502);
        $python_error = new Exception("-------sent 502: Python error in $script_key : $output");
        log_error_on_server($saveDir, $python_error, $sessionID);
        ssh2_disconnect($connection);
        exit();
        
    }

    // in case of successful execution, we add a log entry, save the new data and send it back to the frontend
    $bounding_boxes = json_decode(file_get_contents($bounding_boxes_path), true);
    $transcription = json_decode(file_get_contents($transcription_path), true);
    if(file_exists($generated_transcription_path)){
        $generated_transcription = json_decode(file_get_contents($generated_transcription_path), true);
    }
    else{
        $generated_transcription = [];
    }

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
