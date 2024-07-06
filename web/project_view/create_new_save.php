<?php

/************************************************************************************************************
 * Creates a new save folder and initializes it with the images from the project folder and the other necessary
 * files. This is only used in the "project view" page.

***************************************************************************************************************/

require_once '../config/config.php';
require_once '../utils_php/utils.php';

$payloadFromServer = json_decode(file_get_contents('php://input'), true);
$project_id = $payloadFromServer["project_id"];
$save_id = generate_id("");

$projectDir = "$USER_PROJECTS_ENTRY_POINT/$project_id";
$saveDir = "$projectDir/$save_id";

if(is_dir($saveDir)){
    http_response_code(400);
    $server_error = new Exception("-------sent 400: bad request, saveDir already exists: $saveDir");
    log_error_on_server($projectDir, $server_error);
    exit();
}

mkdir($saveDir);
chmod($saveDir, $folder_permission);

try {
    $user_given_project_name = $payloadFromServer["user_given_project_name"];
    $user_given_save_name = $payloadFromServer["user_given_save_name"];
    $save_images = $payloadFromServer["selectedImages"];

    // create lookup table
    $project_lookup_table = json_decode(file_get_contents("$projectDir/project_lookup_table.json"), true);

    $lookup_table = create_new_lookup_table(".", $saveDir, $project_id, $user_given_project_name, $save_id, $user_given_save_name, $save_images, $project_lookup_table["image_name_mapping"], $file_permission);

    //skeleton of the bounding_boxes.json used as the information transmitter in the tool
    $saveDict = json_decode(file_get_contents("template_bounding_boxes.json"), true); 

    foreach ($save_images as $loopIndex => $imgName) { //copy over all images from project folder to save folder

        copy("$projectDir/$imgName", "$saveDir/$imgName");
        chmod("$saveDir/$imgName", $file_permission);
        
        $saveDict["documents"][$imgName] = [];
        $saveDict["lines"][$imgName] = [];
        
    }

    //create a copy of the transcription.json as well
    $tr_json = json_decode(file_get_contents("template_transcription.json"), true); 
    $tr_json_path = "$saveDir/transcription.json";
    file_put_contents($tr_json_path, json_encode($tr_json));
    chmod($tr_json_path, $file_permission);


    $saveDictPath = "$saveDir/bounding_boxes.json";
    file_put_contents($saveDictPath, json_encode($saveDict));
    chmod($saveDictPath, $file_permission);

    $logString = create_new_log($saveDir, $user_given_project_name, $user_given_save_name, $file_permission);

    $send_to_frontend = [
        "lookup_table" => $lookup_table,
        "log_body" => $logString
    ];
    
    echo json_encode($send_to_frontend);

} catch (Throwable $error_inside_try) {
    log_error_on_server($projectDir, $error_inside_try);
} 

?>
