<?php

/************************************************************************************************************
 * Loads the transcription and bounding boxes from the save folder and sends it back to the frontend. Used frequently
 * in all the three processing view pages.

***************************************************************************************************************/

require_once '../utils_php/utils.php';
require_once '../config/config.php';

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

    $transcription = json_decode(file_get_contents("$saveDir/transcription.json"), true);
    $bounding_boxes = json_decode(file_get_contents("$saveDir/bounding_boxes.json"), true);

    $output_merged = [
        "bounding_boxes" => $bounding_boxes,
        "transcription" => $transcription
    ];
    
    echo json_encode($output_merged);

} catch (Throwable $error_inside_try) {
    log_error_on_server($saveDir, $error_inside_try);
} 

?>
