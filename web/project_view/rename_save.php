<?php

/************************************************************************************************************
 * Renames the save folder and updates the lookup_table.json file. This is only used in the "project view" page.

***************************************************************************************************************/

require_once '../utils_php/utils.php';
require_once '../config/config.php';

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
    
    $lookup_table_path = "$saveDir/lookup_table.json";
    $lookup_table = json_decode(file_get_contents($lookup_table_path), true); 
    $lookup_table["user_given_save_name"] = $user_given_new_save_name;
    file_put_contents($lookup_table_path, json_encode($lookup_table));

    $logFilePath = "$saveDir/log.txt";
    $log_array = file($logFilePath);
    $log_array[2] = "save: $user_given_new_save_name \n";
    file_put_contents($logFilePath, implode($log_array));

    $send_to_frontend = [
        "lookup_table" => $lookup_table,
        "log_body" => file_get_contents($logFilePath)
    ];

    echo json_encode($send_to_frontend);

} catch (Throwable $error_inside_try) {
    log_error_on_server($saveDir, $error_inside_try);
} 

?>
