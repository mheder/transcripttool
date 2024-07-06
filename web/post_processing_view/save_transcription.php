<?php

/************************************************************************************************************
 * Save the user generated transcription on the server. This is only used in the "post-processing view" page.

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
    $trObject = $payload_from_frontend["trObject"]; 
    $trObject_path = "$saveDir/post_processed_transcription.json"; // ! This file name is bound to the one in fetch_transcription.php and import_save.php
    file_put_contents($trObject_path, json_encode($trObject));
    chmod($trObject_path, $file_permission);

    echo json_encode("done"); 

} catch (Throwable $error_inside_try) {
    log_error_on_server($saveDir, $error_inside_try);
} 



?>
