<?php

/************************************************************************************************************
 * Clones a save folder and its contents thus creating a new save. This is only used in the "project view" page.

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

    $user_given_new_save_name = $payloadFromServer["user_given_new_save_name"];
    $new_save_id = generate_id("");
    $new_saveDir = "$projectDir/$new_save_id";
    
    
    if(is_dir($new_saveDir)){
        http_response_code(400);
        $server_error = new Exception("-------sent 400: bad request, new_saveDir already exists: $new_saveDir");
        log_error_on_server($saveDir, $server_error);
        exit();
    }
    
    mkdir($new_saveDir);
    chmod($new_saveDir, $folder_permission);


    foreach (array_map('basename', glob("$saveDir/*")) as $loopIndex => $fileName) { //copy over all files from existing save folder to new one

        copy("$saveDir/$fileName", "$new_saveDir/$fileName");
        chmod("$new_saveDir/$fileName", $file_permission);
        
    }

    // adjust the lookup table from the original save
    $lookup_table_path = "$new_saveDir/lookup_table.json";
    $lookup_table = json_decode(file_get_contents($lookup_table_path), true); 
    $lookup_table["save_id"] = $new_save_id;
    $lookup_table["user_given_save_name"] = $user_given_new_save_name;
    file_put_contents($lookup_table_path, json_encode($lookup_table));
    chmod($lookup_table_path, $file_permission);

    // adjust the log file from the original save
    $logFilePath = "$new_saveDir/log.txt";
    $log_array = file($logFilePath);
    $log_array[2] = "save: $user_given_new_save_name \n";
    file_put_contents($logFilePath, implode($log_array));
    chmod($logFilePath, $file_permission);

    $send_to_frontend = [
        "lookup_table" => $lookup_table,
        "log_body" => file_get_contents($logFilePath)
    ];

    echo json_encode($send_to_frontend);

} catch (Throwable $error_inside_try) {
    log_error_on_server($saveDir, $error_inside_try);
} 

?>
