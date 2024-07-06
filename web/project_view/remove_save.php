<?php

/************************************************************************************************************
 * Removes the specified save folders and their contents. This is only used in the "project view" page.

***************************************************************************************************************/

require_once '../utils_php/utils.php';
require_once '../config/config.php';


$payload_from_frontend = json_decode(file_get_contents('php://input'), true);
$project_id = $payload_from_frontend["project_id"];

$projectDir = "$USER_PROJECTS_ENTRY_POINT/$project_id";

if(!is_dir($projectDir)){
    http_response_code(400);
    $server_error = new Exception("-------sent 400: bad request, projectDir does not exist: $projectDir");
    log_error_on_server($projectDir, $server_error);
    exit();
}

try {
    $save_id_array = $payload_from_frontend["save_id_array"];

    foreach ($save_id_array as $key => $value) {
        deleteAllRecursively("$projectDir/$value");
    }

    echo json_encode("folder and its contents are removed");

} catch (Throwable $error_inside_try) {
    log_error_on_server($projectDir, $error_inside_try);
} 

?>
