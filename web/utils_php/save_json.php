<?php

/************************************************************************************************************
 * Saves the transcription and bounding boxes to the save folder. This is used frequently in all the three
 * processing view pages.

***************************************************************************************************************/

require_once '../utils_php/utils.php';
require_once '../config/config.php';

$frontend_output = json_decode(file_get_contents('php://input'), true);
$bounding_boxes = $frontend_output["bounding_boxes"];
$tr_json = $frontend_output["transcription"];
$project_id = $frontend_output["project_id"];
$save_id = $frontend_output["save_id"];

$projectDir = "$USER_PROJECTS_ENTRY_POINT/$project_id";
$saveDir = "$projectDir/$save_id";

if(!is_dir($saveDir)){
    http_response_code(400);
    $server_error = new Exception("-------sent 400: bad request, saveDir does not exist: $saveDir");
    log_error_on_server($projectDir, $server_error);
    exit();
}

try {
    $saveDictPath = "$saveDir/bounding_boxes.json";
    $tr_json_path = "$saveDir/transcription.json";

    file_put_contents($saveDictPath, json_encode($bounding_boxes));
    file_put_contents($tr_json_path, json_encode($tr_json));
    
    echo json_encode($frontend_output); // not necessary to send this back

} catch (Throwable $error_inside_try) {
    log_error_on_server($saveDir, $error_inside_try);
} 

?>
