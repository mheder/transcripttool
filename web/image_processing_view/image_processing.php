<?php

/************************************************************************************************************
 * This is the "image processing view" page. The user can use here image processing methods to generate
 * automatically bounding boxes around symbols and clusters as alphabets. Please see the "image_processing.js"
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

$list_of_fine_tuned_models = [];

$save_images = array_map('basename', glob("$saveDir/*.{jpg,png,jpeg}",  GLOB_BRACE));

// the user given name is the key, and the server name is the value
if (is_file($lookup_table_path)){

    $lookup_table = json_decode(file_get_contents($lookup_table_path), true); 
    $list_of_fine_tuned_models = $lookup_table["fine_tuned_model_name_mapping"];

    // Backward compatibility.
    if(count(array_keys($lookup_table["image_name_mapping"])) === 0){

        foreach ($save_images as $i => $image_path) { 

            error_log($image_path);

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
    "project_lookup_table" => $project_lookup_table ,
    "list_of_fine_tuned_models" => $list_of_fine_tuned_models,
    "LOAD_JSON_PHP_PATH" => "../utils_php/load_json.php",
    "SAVE_JSON_PHP_PATH" => "../utils_php/save_json.php",
    "FETCH_TRANSCRIPTION_PHP_PATH" => "../utils_php/fetch_transcription.php",
    "RUN_ASYNC_PYTHON_CODE_PHP_PATH" => "run_async_py_scripts.php",
    "RUN_FEW_SHOT_PYTHON_CODE_PHP_PATH" => $RUN_GPU_PY_CODE,
];

$send_to_frontend = json_encode($send_to_frontend);

?>

<!DOCTYPE html>
    <head>
        <title>Image Processing View</title>
        <link rel="icon" type="image/png" href="../../images/logo-decode.png">
        <link rel="stylesheet" href="../../libs/fontawesome-free-5.15.4-web/css/all.min.css"> <!-- https://fontawesome.com/v5/docs/web/setup/host-font-awesome-yourself -->
        <link rel="stylesheet" href="../../libs/jquery-ui-1.12.1/jquery-ui.min.css"> <!-- https://jqueryui.com/download/ -->
        <link rel="stylesheet" href="../utils_css/scrollbar.css">
        <link rel="stylesheet" href="../utils_css/general_layout.css">
        <link rel="stylesheet" href="../utils_css/boxes.css">
        <link rel="stylesheet" href="image_processing.css">
        <link rel="stylesheet" href="../utils_css/functional_classes.css">
        <link rel="stylesheet" href="../utils_css/constants.css">
        
        <script> <?php echo "const send_to_frontend = $send_to_frontend;"; ?> </script> <!-- We send the necessary information to the frontend here. -->
        <script src="../../libs/jquery-3.5.1.min.js"></script> <!-- https://jquery.com/download/ -->
        <script src="../../libs/jquery-ui-1.12.1/jquery-ui.min.js"></script> <!-- https://jqueryui.com/download/ -->
        <script src="../../libs/xstate.js"></script>  <!-- https://xstate.js.org/docs/guides/installation.html -->
        <script src='../../libs/FileSaver.js-master/dist/FileSaver.min.js'></script> <!-- https://github.com/eligrey/FileSaver.js -->
        <script src='../../libs/jszip-master/dist/jszip.min.js'></script> <!-- https://stuk.github.io/jszip/ -->
        <script type="module" src="image_processing.js"></script>
    </head>
    <body>
        <div id="leftMenu">
            <h3 class="menuHeading">TRANSCRIPT Tool</h3>
            <a id="redirectMainPage" class="hyperlink" href=""> Project View </a>
            <a id="redirectPreProcPage" class="hyperlink" href=""> Pre-processing View </a>
            <a id="redirectEditingPage" class="hyperlink" href=""> Post-processing View </a>
            <h3 class="menuHeading">Settings</h3>
            <h3 class="menuHeading">Help</h3>
        </div>
        <div class="container">
            <header id="header">
                    <b id="leftMenuButton" class=""> Menu </b>
                    <div class="overButtonArea">
                        <i id="saveButton" class="far fa-save toolTipButton"> <span id="saveButtonToolTip" class="toolTip">save page</span> </i>
                        <i id="reloadButton" class="fas fa-redo-alt toolTipButton"> <span id="reloadButtonToolTip" class="toolTip">reload saved page</span> </i>
                        <i id="swap_selection_button" class="fas fa-exchange-alt toolTipButton"> <span id="swap_selection_button_tooltip" class="toolTip">swap selection of all regular boxes</span> </i>
                        <span class="fa-stack">
                            <i id="snow_icon" class="far fa-snowflake toolTipButton fa-stack-2x"></i>
                            <i id="swap_frozen_selection_button" class="fas fa-exchange-alt toolTipButton fa-stack-1x"> <span id="swap_frozen_selection_button_tooltip" class="toolTip">swap selection of all frozen boxes</span> </i>
                        </span>
                        <i id="freeze_button" class="far fa-snowflake toolTipButton"> <span id="freeze_button_tooltip" class="toolTip">freeze/unfreeze selected boxes</span> </i>
                        <i id="addBoxButton" class="fas fa-square toolTipButton"> <span id="addBoxButtonToolTip" class="toolTip">add one regular box to page (SPACE)</span> </i>
                        <i id="removeBoxButton" class="fas fa-trash toolTipButton"> <span id="removeBoxButtonToolTip" class="toolTip">remove selected boxes from page (DELETE)</span> </i>
                        <i id="removeAllBoxButton" class="fas fa-unlink toolTipButton"> <span id="removeAllBoxButtonToolTip" class="toolTip">remove all regular boxes from page</span> </i>
                        <i id="exportButton" class="fas fa-file-export toolTipButton"> <span id="exportButtonToolTip" class="toolTip">export project</span> </i>
                    </div>
                    <b id="pageTitle">  </b>
            </header>
            <div class="errorWidget">
                <b class="errorText">   </b>
                <button class="errorButton"> Understood </button>
            </div>  
            
            <div class="image_area">
                <!-- images and boxes are added here by the image_processing.js -->
            </div>
            <div id="leftButtonArea" class="button_area onClickMenu">
                <b class="buttonAreaCaptions"> Image Processing Methods </b>

                <div id="dropdownWrapper">
                    <div class="stateDropdownMenu">
                        <b id="asyncLineSegmentationDropdownState" class="dropdownState"> <i class="fas fa-arrow-left"></i> line segmentation <i class="fas fa-arrow-right"></i> </b>                    
                        <b id="fewShotsDropdownState" class="dropdownState"> <i class="fas fa-arrow-left"></i> few-shot prediction <i class="fas fa-arrow-right"></i> </b>
                        <b id="few_shot_train_dropdown_state" class="dropdownState"> <i class="fas fa-arrow-left"></i> few-shot fine tuning <i class="fas fa-arrow-right"></i> </b>
                        <b id="asyncSegmentationDropdownState" class="dropdownState"> <i class="fas fa-arrow-left"></i> segmentation <i class="fas fa-arrow-right"></i> </b>
                        <b id="asyncClusteringDropdownState" class="dropdownState"> <i class="fas fa-arrow-left"></i> clustering <i class="fas fa-arrow-right"></i> </b>
                        <b id="asyncLabelPropagationDropdownState" class="dropdownState"> <i class="fas fa-arrow-left"></i> label propagation <i class="fas fa-arrow-right"></i> </b>
                    </div>   
                    <div id="loadingStateWrapper" class="stateWrapper hideElement">
                        <b class="loadingText"> processing </b>
                        <i class="fas fa-spinner fa-spin"></i>         
                    </div>
                    
                    <div id="asyncLineSegmentationStateWrapper" class="stateWrapper hideElement">
                        <div class="RadioWrapper">
                            <div>
                                <input id="lineRadioFalse" type="radio" name="lineRadio" value="false" checked>
                                <label for="lineRadioFalse">Use no segmented lines</label>   
                            </div>
                            <div>
                                <input id="lineRadioTrue" type="radio" name="lineRadio" value="true">
                                <label for="lineRadioTrue">Use a few consecutive segmented lines</label> 
                            </div>
                        </div>
                        <button id="executeAsyncLineSegmentationButton" class="stateButton"> execute </button>
                    </div>
                    <div id="fewShotsStateWrapper" class="stateWrapper hideElement">
                        <div class="innerStateWrapper">
                            <b class="radioHeader"> Alphabet </b>
                            <div id="fewShotsAlphabetSelection" class="RadioWrapper">
                                <div>
                                    <input type="radio" name="fewShotsAlphabetRadio" value="borg" checked>
                                    <label>Borg</label>   
                                </div>
                                <div>
                                    <input type="radio" name="fewShotsAlphabetRadio" value="copiale">
                                    <label>Copiale</label> 
                                </div>
                                <div>
                                    <input type="radio" name="fewShotsAlphabetRadio" value="vatican">
                                    <label>Digits</label> 
                                </div>
                                <div>
                                    <input type="radio" name="fewShotsAlphabetRadio" value="runic">
                                    <label>Runic</label> 
                                </div>
                                <div>
                                    <input type="radio" name="fewShotsAlphabetRadio" value="ramanacoil">
                                    <label>Ramanacoil</label> 
                                </div>
                            </div>
                            <b class="radioHeader"> Model </b>
                            <div id="fewShotsModelSelection" class="RadioWrapper">
                                <div>
                                    <input type="radio" name="fewShotsModelRadio" value="omniglot" checked>
                                    <label>Omniglot</label> 
                                </div>
                                <div>
                                    <input type="radio" name="fewShotsModelRadio" value="cipherglot-mix">
                                    <label>Cipherglot-mix</label> 
                                </div>
                                <div>
                                    <input type="radio" name="fewShotsModelRadio" value="cipherglot-separated">
                                    <label>Cipherglot-separated</label> 
                                </div>
                                <div>
                                    <input type="radio" name="fewShotsModelRadio" value="borg">
                                    <label >Borg</label>   
                                </div>
                                <div>
                                    <input type="radio" name="fewShotsModelRadio" value="copiale">
                                    <label >Copiale</label> 
                                </div>
                                <div>
                                    <input type="radio" name="fewShotsModelRadio" value="vatican">
                                    <label >Digits</label> 
                                </div>
                                <div>
                                    <input type="radio" name="fewShotsModelRadio" value="runic">
                                    <label>Runic</label> 
                                </div>
                            </div>
                            <b class="radioHeader"> Read spaces </b>
                            <div class="RadioWrapper">
                                <div>
                                    <input type="radio" name="fewShotReadSpaceBool" value="1">
                                    <label >Yes</label>   
                                </div>
                                <div>
                                    <input type="radio" name="fewShotReadSpaceBool" value="0" checked>
                                    <label >No</label>   
                                </div>
                            </div>
                            <div class="inputWrapper">
                                <label for="numberOfShots">Number of shots (default 5):</label>
                                <input id="numberOfShots" type="number" name="numberOfShots" value="5" max="5" min="1" step="1">
                            </div>
                            <div class="inputWrapper">
                                <label for="thresholdFewShots">Threshold (default 0.4):</label>
                                <input id="thresholdFewShots" type="number" name="thresholdFewShots" value="0.4" max="1" min="0.01" step="0.01">
                            </div>
                            
                        </div>
                        <button id="executeFewShotsButton" class="stateButton"> execute </button>
                    </div>
                    <div id="few_shot_train_state_wrapper" class="stateWrapper hideElement">
                        <div class="innerStateWrapper">
                            <b class="radioHeader"> Alphabet </b>
                            <div id="few_shot_train_alphabet_selection" class="RadioWrapper">
                                <div>
                                    <input type="radio" name="few_shot_train_alphabet_radio" value="borg" checked>
                                    <label>Borg</label>   
                                </div>
                                <div>
                                    <input type="radio" name="few_shot_train_alphabet_radio" value="copiale">
                                    <label>Copiale</label> 
                                </div>
                                <div>
                                    <input type="radio" name="few_shot_train_alphabet_radio" value="vatican">
                                    <label>Digits</label> 
                                </div>
                                <div>
                                    <input type="radio" name="few_shot_train_alphabet_radio" value="runic">
                                    <label>Runic</label> 
                                </div>
                                <div>
                                    <input type="radio" name="few_shot_train_alphabet_radio" value="ramanacoil">
                                    <label>Ramanacoil</label> 
                                </div>
                            </div>
                            <b class="radioHeader"> Validate </b>
                            <div class="RadioWrapper">
                                <div>
                                    <input type="radio" name="user_validation_flag" value="1">
                                    <label >Yes</label>   
                                </div>
                                <div>
                                    <input type="radio" name="user_validation_flag" value="0" checked>
                                    <label >No</label>   
                                </div>
                            </div>
                            <b class="radioHeader"> Model </b>
                            <div id="few_shot_train_model_selection" class="RadioWrapper">
                                <div>
                                    <input id="few_shot_train_omniglot" type="radio" name="few_shot_train_model_radio" value="omniglot" checked>
                                    <label>Omniglot</label> 
                                </div>
                                <div>
                                    <input id="few_shot_train_cipherglot-mix" type="radio" name="few_shot_train_model_radio" value="cipherglot-mix">
                                    <label>Cipherglot-mix</label> 
                                </div>
                                <div>
                                    <input id="few_shot_train_cipherglot-separated" type="radio" name="few_shot_train_model_radio" value="cipherglot-separated">
                                    <label>Cipherglot-separated</label> 
                                </div>
                            </div>
                            <div id="wrapper_few_shot_train_new_model_name" class="inputWrapper">
                                <label for="few_shot_train_new_model_name">New model:</label>
                                <input id="few_shot_train_new_model_name" type="string" maxlength="20" name="few_shot_train_new_model_name" value="" placeholder="enter name...">
                            </div>
                            <div class="inputWrapper">
                                <label for="few_shot_train_epochs">Epochs (default 6):</label>
                                <input id="few_shot_train_epochs" type="number" name="few_shot_train_epochs" value="6" max="20" min="1" step="1">
                            </div>
                            
                        </div>
                        <button id="execute_few_shot_train_button" class="stateButton"> execute </button>
                    </div>
                    <div id="asyncSegmentationStateWrapper" class="stateWrapper hideElement">
                        <div class="inputWrapper">
                            <label for="show_hide_parameters">Show/hide parameter settings:</label>
                            <input id="show_hide_parameters" type="checkbox" name="show_hide_parameters" checked="false">
                        </div>
                        <div class="RadioWrapper">
                            <div>
                                <input id="segmentation_borg_setup" type="radio" name="asyncSegmentationRadio" value="segmentation_borg_setup" checked>
                                <label for="segmentation_borg_setup">Borg setup</label>   
                            </div>
                            <div>
                                <input id="segmentation_copiale_setup" type="radio" name="asyncSegmentationRadio" value="segmentation_copiale_setup">
                                <label for="segmentation_copiale_setup">Copiale setup</label> 
                            </div>
                            <div>
                                <input id="segmentation_digits_setup" type="radio" name="asyncSegmentationRadio" value="segmentation_digits_setup">
                                <label for="segmentation_digits_setup">Digits setup</label> 
                            </div>
                        </div>
                        <div id="async_segmentation_inner_state_wrapper" class="innerStateWrapper hideElement">
                            <div class="inputWrapper">
                                <label for="minDistLineSeg">Minimum distance between lines in pixels (default 70)</label>
                                <input id="minDistLineSeg" type="number" name="minDistLineSeg" value="70" max="500" min="1" step="1">
                            </div>
                            <div class="inputWrapper">
                                <label for="thAboveBelowSymbol">Maximal gap size inside symbols in pixels (default 25):</label>
                                <input id="thAboveBelowSymbol" type="number" name="thAboveBelowSymbol" value="25" max="100" min="1" step="1">
                            </div>
                            <div class="inputWrapper">
                                <label for="thSizeCC">Minimum area of symbols in pixels (default 20):</label>
                                <input id="thSizeCC" type="number" name="thSizeCC" value="20" max="200" min="1" step="1">
                            </div>
                            <div class="inputWrapper">
                                <label for="littleSymbol">Little symbols (default false):</label>
                                <input id="littleSymbol" type="checkbox" name="littleSymbol" checked="false">
                            </div>
                            <div class="inputWrapper">
                                <label for="topBottomCheck">Check symbol top and bottom (default true):</label>
                                <input id="topBottomCheck" type="checkbox" name="topBottomCheck" checked="true">
                            </div>
                            <div class="inputWrapper">
                                <label for="leftRightCheck">Check symbol left and right (default false):</label>
                                <input id="leftRightCheck" type="checkbox" name="leftRightCheck" checked="false">
                            </div>
                            <div class="inputWrapper">
                                <label for="insideCheck">Check the symbol's inside (default false):</label>
                                <input id="insideCheck" type="checkbox" name="insideCheck" checked="false">
                            </div>
                            <div class="inputWrapper">
                                <label for="combineLittleSymbols">Combine little symbols (default false):</label>
                                <input id="combineLittleSymbols" type="checkbox" name="combineLittleSymbols" checked="false">
                            </div>
                            <div class="inputWrapper">
                                <label for="permitCollision">Permit symbol collision (default true):</label>
                                <input id="permitCollision" type="checkbox" name="permitCollision" checked="true">
                            </div>
                            <div class="inputWrapper">
                                <label for="specialSymbols_likely_surrounded">Special symbols are surrounded (default false):</label>
                                <input id="specialSymbols_likely_surrounded" type="checkbox" name="specialSymbols_likely_surrounded" checked="false">
                            </div>
                        </div>
                        <button id="executeAsyncSegmentationButton" class="stateButton"> execute </button>
                    </div>
                    <div id="asyncClusteringStateWrapper" class="stateWrapper hideElement">
                        <div class="inputWrapper">
                            <label for="minImages">Minimum number of boxes per cluster (default 50):</label>
                            <input id="minImages" type="number" name="minImages" value="50" max="100" min="1" step="1">
                        </div>
                        <button id="executeAsyncClusteringButton" class="stateButton"> execute </button>   
                    </div>
                    <div id="asyncLabelPropagationStateWrapper" class="stateWrapper hideElement">
                        <div class="inputWrapper">
                            <label for="alphaLabelPropagation">Alpha (change) threshold (default 0.2):</label>
                            <input id="alphaLabelPropagation" type="number" name="alphaLabelPropagation" value="0.2" max="1" min="0.01" step="0.01">
                        </div>
                        <button id="executeAsyncLabelPropagationButton" class="stateButton"> execute </button>  
                    </div>
                    
                </div>                                                                     
            </div>
        </div>
    </body>
</html>


