<?php

/************************************************************************************************************
 * This is the "post-processing view" page. The user can manually edit here the boxes (symbols) and clusters
 * (alphabet) that were generated in the "image processing view" page. The user can in the end export the
 * resulting transcription (and other data). Please see the "post_processing.js"
 * file for the logic, here we only retrieve the necessary init data from the server.
 * 
*************************************************************************************************************/

require_once '../config/config.php';
require_once '../utils_php/utils.php';

//*************************************processing querystring: potential for cyberattack

$project_id = filter_input(INPUT_GET, 'project_id', FILTER_SANITIZE_SPECIAL_CHARS);
$save_id = filter_input(INPUT_GET, 'save_id', FILTER_SANITIZE_SPECIAL_CHARS);

//*************************************processing querystring: potential for cyberattack

//if no project id or save id, then everything else will fail too, might as well just throw a 404 right away
if(in_array($project_id, [false, null], TRUE) || in_array($save_id, [false, null], TRUE)){ 
    http_response_code(404);
    include('../utils_php/trtool_404.php');
    die();
}

$projectDir = "$USER_PROJECTS_ENTRY_POINT/$project_id";
$saveDir = "$projectDir/$save_id";

if(!is_dir($saveDir)){
    http_response_code(400);
    $server_error = new Exception("-------sent 400: bad request, saveDir does not exist: $saveDir");
    log_error_on_server($projectDir, $server_error);
    exit();
}

$bounding_boxes_path = "$saveDir/bounding_boxes.json";

$bounding_boxes = json_decode(file_get_contents($bounding_boxes_path), true);

//if bounding_boxes is empty, then 404 again
if(!array_key_exists("documents", $bounding_boxes)){ 
    http_response_code(404);
    include('../utils_php/trtool_404.php');
    die();
}

$project_lookup_table = json_decode(file_get_contents("$projectDir/project_lookup_table.json"), true);
$lookup_table_path = "$saveDir/lookup_table.json";
$lookup_table = [];

$save_images = array_map('basename', glob("$saveDir/*.{jpg,png,jpeg}",  GLOB_BRACE));

// the user given name is the key, and the server name is the value
if (is_file($lookup_table_path)){
    $lookup_table = json_decode(file_get_contents($lookup_table_path), true); 

    // Backward compatibility.
    if(count(array_keys($lookup_table["image_name_mapping"])) === 0){

        foreach ($save_images as $i => $image_path) { 

            if(!array_key_exists($image_path, $project_lookup_table["image_name_mapping"])){
                $lookup_table["image_name_mapping"][$image_path] = $project_lookup_table["image_name_mapping"][$image_path];
            }
        
        }

        file_put_contents($lookup_table_path, json_encode($lookup_table));
        chmod($lookup_table_path, $file_permission);
    }
}
else{ // Backward compatibility.

    // Note that the "user_given_save_name" cannot be recovered anymore; we use the save_id instead.
    $lookup_table = create_new_lookup_table("../project_view", $saveDir, $project_id, $project_name, $save_id, $save_id, $save_images, $project_lookup_table["image_name_mapping"], $file_permission);
}

$send_to_frontend = [
    "project_id" => $project_id,
    "save_id" => $save_id,
    "lookup_table" => $lookup_table,
    "LOAD_JSON_PHP_PATH" => "../utils_php/load_json.php",
    "SAVE_JSON_PHP_PATH" => "../utils_php/save_json.php",
    "FETCH_TRANSCRIPTION_PHP_PATH" => "../utils_php/fetch_transcription.php",
    "SAVE_TRANSCRIPTION_PHP_PATH" => "save_transcription.php"
];

$send_to_frontend = json_encode($send_to_frontend);

?>

<!DOCTYPE html>
    <head>
        <title>Post-processing View</title>
        <link rel="icon" type="image/png" href="../../images/logo-decode.png">
        <link rel="stylesheet" href="../../libs/fontawesome-free-5.15.4-web/css/all.min.css"> <!-- https://fontawesome.com/v5/docs/web/setup/host-font-awesome-yourself -->
        <link rel="stylesheet" href="../../libs/jquery-ui-1.12.1/jquery-ui.min.css"> <!-- https://jqueryui.com/download/ -->
        <link rel="stylesheet" href="../utils_css/scrollbar.css">
        <link rel="stylesheet" href="../utils_css/general_layout.css">
        <link rel="stylesheet" href="../utils_css/boxes.css">
        <link rel="stylesheet" href="post_processing.css">
        <link rel="stylesheet" href="../utils_css/functional_classes.css">
        <link rel="stylesheet" href="../utils_css/constants.css">


        <script> <?php echo "const send_to_frontend = $send_to_frontend;"; ?> </script> <!-- We send the necessary information to the frontend here. -->
        <script src="../../libs/jquery-3.5.1.min.js"></script> <!-- https://jquery.com/download/ -->
        <script src="../../libs/jquery-ui-1.12.1/jquery-ui.min.js"></script> <!-- https://jqueryui.com/download/ -->
        <script src="../../libs/xstate.js"></script>  <!-- https://xstate.js.org/docs/guides/installation.html -->
        <script src='../../libs/FileSaver.js-master/dist/FileSaver.min.js'></script> <!-- https://github.com/eligrey/FileSaver.js -->
        <script src='../../libs/jszip-master/dist/jszip.min.js'></script> <!-- https://stuk.github.io/jszip/ -->
        <script type="module" src="post_processing.js"></script>
    </head>
    <body>
        <div id="leftMenu">
            <h3 class="menuHeading">TRANSCRIPT Tool</h3>
            <a id="redirectMainPage" class="hyperlink" href=""> Project View </a>
            <a id="redirectPreProcPage" class="hyperlink" href=""> Pre-processing View </a>
            <a id="redirectImageProcPage" class="hyperlink" href=""> Image Processing View </a>
            <h3 class="menuHeading">Settings</h3>
            <h3 class="menuHeading">Help</h3>
        </div>
        <div class="container">
            <header id="header">
                <b id="leftMenuButton" class=""> Menu </b>
                <div class="overButtonArea">
                    <b id="transcriptionPreviewButton" class="toolTipButton activeToggle"> tr <span id="transcriptionPreviewButtonToolTip" class="toolTip"> toggle preview</span> </b>
                    <i id="saveButton" class="far fa-save toolTipButton"> <span id="saveButtonToolTip" class="toolTip">save page</span> </i>
                    <i id="reloadButton" class="fas fa-redo-alt toolTipButton"> <span id="reloadButtonToolTip" class="toolTip">reload saved page</span> </i>
                    <i id="showAllBoxesButton" class="fas fa-eye toolTipButton"> <span id="showAllBoxesButtonToolTip" class="toolTip">show all boxes and deselect clusters</span> </i>
                    <i id="addBoxButton" class="fas fa-square toolTipButton"> <span id="addBoxButtonToolTip" class="toolTip">add one box to page (SPACE)</span> </i>
                    <i id="removeBoxButton" class="fas fa-trash toolTipButton"> <span id="removeBoxButtonToolTip" class="toolTip">remove selected boxes (DELETE)</span> </i>
                    <i id="addToClusterButton" class="far fa-plus-square toolTipButton"> <span id="addToClusterButtonToolTip" class="toolTip">add selected boxes to selected cluster</span> </i>
                    <i id="removeFromClusterButton" class="far fa-minus-square toolTipButton"> <span id="removeFromClusterButtonToolTip" class="toolTip">remove selected boxes from respective cluster</span> </i>
                    <i id="createNewClusterButton" class="fas fa-object-group toolTipButton"> <span id="createNewClusterButtonToolTip" class="toolTip">create new cluster with selected boxes</span> </i>
                    <i id="removeClusterButton" class="far fa-object-ungroup toolTipButton"> <span id="removeClusterButtonToolTip" class="toolTip">remove selected clusters</span> </i>
                    <i id="exportButton" class="fas fa-file-export toolTipButton"> <span id="exportButtonToolTip" class="toolTip">export project</span> </i>
                </div>
                <b id="pageTitle">  </b>
            </header>
            <div class="errorWidget">
                <b class="errorText">   </b>
                <button class="errorButton"> Understood </button>
            </div> 
            <div class="image_area">
                <!-- images and boxes are added here by the post_processing.js -->
            </div>
            <div id="leftButtonArea" class="button_area onClickMenu">
                <b class="listTitle"> Alphabet </b>
                <div id="loadingStateWrapper" class="stateWrapper hideElement">
                    <b class="loadingText"> processing </b>
                    <i class="fas fa-spinner fa-spin"></i>         
                </div>

                <ul id="trMenu" class="trMenuWrapper hideElement">   
                    <!-- clusters (or alphabet) are added here by the post_processing.js -->
                </ul> 
            </div>

            <div class="saveWarning hideElement">
                <b class="saveWarningText"> saving... </b>
                <i class="fas fa-spinner fa-spin"></i>         
            </div>
            
            <div id="rightButtonArea" class="button_area onClickMenu">
                <b class="listTitle"> Graphic Alphabet  </b>
                <div class="canvasWrapper">
                    <!-- previews of symbols are added here by the post_processing.js -->
                </div>          
            </div> 
        </div>
    </body>
</html>


