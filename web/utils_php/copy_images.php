<?php

/************************************************************************************************************
 * Copies one or all images from the project folder to the save folder: in order to restore the original images
 * to the save folder. This is only used in the "pre-processing view" page.

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

    $flag = $payloadFromServer["flag"];

    if($flag === "image"){

        $currentImageName = $payloadFromServer["currentImageName"];

        copy("$projectDir/$currentImageName" , "$saveDir/$currentImageName");
        chmod("$saveDir/$currentImageName", $file_permission);

    }
    else if($flag === "document"){

        $listOfSaveImages = array_map('basename', glob("$saveDir/*.{jpg,png,jpeg}",  GLOB_BRACE)); // GLOB_BRACE expands the {...} to match all of them

        foreach ($listOfSaveImages as $loopIndex => $imgName) { //copy over all images from project folder to save folder

            copy("$projectDir/$imgName", "$saveDir/$imgName");
            chmod("$saveDir/$imgName", $file_permission);

        }

    }
    else{
        throw new Exception("============= Our custom exception: no such flag: $flag");
    }

    echo json_encode("copy images successful");
    

} catch (Throwable $error_inside_try) {
    log_error_on_server($saveDir, $error_inside_try);
} 

?>
