<?php

/************************************************************************************************************
 * This is the "pre-processing view" page. For a new save with unedited images, this is the first page the user
 * will use. The user can crop, rotate, and binarize the images here. Please see the "pre_processing.js"
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

//if bounding_boxes is empty, then 404
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
    "listOfImages" => $save_images,
    "LOAD_JSON_PHP_PATH" => "../utils_php/load_json.php",
    "COPY_IMAGE_PHP_PATH" => "../utils_php/copy_images.php",
    "FETCH_TRANSCRIPTION_PHP_PATH" => "../utils_php/fetch_transcription.php"
];

$send_to_frontend = json_encode($send_to_frontend);


?>

<!DOCTYPE html>
    <head>
        <title>Pre-processing View</title>
        <link rel="icon" type="image/png" href="../../images/logo-decode.png">
        <link rel="stylesheet" href="../../libs/fontawesome-free-5.15.4-web/css/all.min.css"> <!-- https://fontawesome.com/v5/docs/web/setup/host-font-awesome-yourself -->
        <link rel="stylesheet" href="../../libs/jquery-ui-1.12.1/jquery-ui.min.css"> <!-- https://jqueryui.com/download/ -->
        <link rel="stylesheet" href="../utils_css/scrollbar.css">
        <link rel="stylesheet" href="../utils_css/general_layout.css">
        <link rel="stylesheet" href="../utils_css/boxes.css">
        <link rel="stylesheet" href="pre_processing.css">
        <link rel="stylesheet" href="../utils_css/functional_classes.css">
        <link rel="stylesheet" href="../utils_css/constants.css">


        <script> <?php echo "const send_to_frontend = $send_to_frontend;"; ?> </script> <!-- We send the necessary information to the frontend here. -->
        <script src="../../libs/jquery-3.5.1.min.js"></script> <!-- https://jquery.com/download/ -->
        <script src="../../libs/jquery-ui-1.12.1/jquery-ui.min.js"></script> <!-- https://jqueryui.com/download/ -->
        <script src="../../libs/xstate.js"></script>  <!-- https://xstate.js.org/docs/guides/installation.html -->
        <script src='../../libs/FileSaver.js-master/dist/FileSaver.min.js'></script> <!-- https://github.com/eligrey/FileSaver.js -->
        <script src='../../libs/jszip-master/dist/jszip.min.js'></script> <!-- https://stuk.github.io/jszip/ -->
        <script type="module" src="pre_processing.js"></script>
    </head>
    <body>
        <div id="leftMenu">
            <h3 class="menuHeading">TRANSCRIPT Tool</h3>
            <a id="redirectMainPage" class="hyperlink" href=""> Project View </a>
            <a id="redirectImageProcPage" class="hyperlink" href=""> Image Processing View </a>
            <a id="redirectEditingPage" class="hyperlink" href=""> Post-processing View </a>
            <h3 class="menuHeading">Settings</h3>
            <h3 class="menuHeading">Help</h3>
        </div>
        <div class="container">
            <header id="header">
                <b id="leftMenuButton" class=""> Menu </b>
                <div class="overButtonArea">
                    <b id="previousPageChanger" class="toolTipButton pageChangeWrapper invisibleElement">  <i class="fas fa-arrow-left"></i> PREV </b>
                    <i id="saveButton" class="far fa-save toolTipButton"> <span id="saveButtonToolTip" class="toolTip">save page</span> </i>
                    <i id="reloadPageButton" class="fas fa-redo-alt toolTipButton"> <span id="reloadPageButtonToolTip" class="toolTip">reload original image</span> </i>
                    <i id="reloadDocumentButton" class="fas fa-sync toolTipButton"> <span id="reloadDocumentButtonToolTip" class="toolTip">reload all original images</span> </i>
                    <div id="left_ninty" class="rot_arrow ninty_arrow toolTipButton">&#8635; <span id="left_nintyToolTip" class="toolTip">rotate left by 90°</span> </div>
                    <div id="left_small" class="rot_arrow toolTipButton">&#10553; <span id="left_smallToolTip" class="toolTip">rotate left by 1°</span> </div>
                    <div id="reload" class="rot_arrow toolTipButton">&#10226; <span id="reloadToolTip" class="toolTip">set back to 0°</span> </div>
                    <div id="right_small" class="rot_arrow toolTipButton">&#10552; <span id="right_smallToolTip" class="toolTip">rotate right by 1°</span> </div>
                    <div id="right_ninty" class="rot_arrow ninty_arrow toolTipButton">&#8634; <span id="right_nintyToolTip" class="toolTip">rotate right by 90°</span> </div>
                    <i id="exportButton" class="fas fa-file-export toolTipButton"> <span id="exportButtonToolTip" class="toolTip">export project</span> </i>
                    <b id="nextPageChanger" class="toolTipButton pageChangeWrapper invisibleElement"> NEXT <i class="fas fa-arrow-right"></i>  </b>
                </div>
                <b id="pageTitle">  </b>
            </header>
            <div class="errorWidget">
                <b class="errorText">   </b>
                <button class="errorButton"> Understood </button>
            </div>  
            <div class="image_area"> 
                <!-- images and boxes are added here by the pre_processing.js -->
            </div>
            <div id="leftButtonArea" class="button_area onClickMenu">
                <b class="buttonAreaCaptions"> Pre-processing methods </b>
                
                <div id="dropdownWrapper">
                    <div class="stateDropdownMenu">
                        <b id="cropRotDropdownState" class="dropdownState"> <i class="fas fa-arrow-left"></i> crop and rotate <i class="fas fa-arrow-right"></i> </b>                    
                        <b id="binarizeDropdownState" class="dropdownState"> <i class="fas fa-arrow-left"></i> binarize <i class="fas fa-arrow-right"></i> </b>    
                    </div>   
                    <div id="loadingStateWrapper" class="stateWrapper hideElement">
                        <b class="loadingText"> processing </b>
                        <i class="fas fa-spinner fa-spin"></i>         
                    </div>
                    <div id="cropRotStateWrapper" class="stateWrapper hideElement">
                        <button id="executeRotCropButton" class="stateButton"> execute </button>  
                    </div>
                    <div id="binarizeStateWrapper" class="stateWrapper hideElement">
                        <div class="RadioWrapper">
                            <div id="binarizationRadioOtsuWrapper" class="radioInnerWrapper">
                                <input id="binarizationRadioOtsu" class="radioElements" type="radio" name="binarizationRadio" value="Otsu" checked>
                                <label for="binarizationRadioOtsu" class="radioElements">Otsu</label>   
                                <b id="binarizationRadioOtsuToolTip" class="binarizeTooltip"> Fast and simple but reliable, use this method in general. </b>
                            </div>
                            <div id="binarizationRadioGaussianWrapper" class="radioInnerWrapper">
                                <input id="binarizationRadioGaussian" class="radioElements" type="radio" name="binarizationRadio" value="Gaussian">
                                <label for="binarizationRadioGaussian" class="radioElements">Gaussian</label> 
                                <b id="binarizationRadioGaussianToolTip" class="binarizeTooltip"> Use this method for noisy images. </b>
                            </div>
                            <div id="binarizationRadioAdaptiveWrapper" class="radioInnerWrapper">
                                <input id="binarizationRadioAdaptive" class="radioElements" type="radio" name="binarizationRadio" value="Adaptive">
                                <label for="binarizationRadioAdaptive" class="radioElements">Adaptive</label> 
                                <b id="binarizationRadioAdaptiveToolTip" class="binarizeTooltip"> If the Otsu method does not work well, use this instead. </b>
                            </div>
                            <div id="binarizationRadioNiblackWrapper" class="radioInnerWrapper">
                                <input id="binarizationRadioNiblack" class="radioElements" type="radio" name="binarizationRadio" value="Niblack">
                                <label for="binarizationRadioNiblack" class="radioElements">Niblack</label> 
                                <b id="binarizationRadioNiblackToolTip" class="binarizeTooltip"> Use this method for images where the background is not uniform. </b>
                            </div>
                            <div id="binarizationRadioSauvolaWrapper" class="radioInnerWrapper">
                                <input id="binarizationRadioSauvola" class="radioElements" type="radio" name="binarizationRadio" value="Sauvola">
                                <label for="binarizationRadioSauvola" class="radioElements">Sauvola</label> 
                                <b id="binarizationRadioSauvolaToolTip" class="binarizeTooltip"> If the Niblack method gives too much noise, you can try this one. </b>
                            </div>
                        </div>

                        <button id="generateBinarizeButton" class="stateButton"> generate </button>  

                    </div>
                </div>                                                                     
            </div>
        </div>
    </body>
</html>


