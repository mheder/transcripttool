/************************************************************************************************************
 * Handles the image processing view page. This is the "middle" page, where the user can run various
 * image processing algorithms on the images and generate automatically bounding boxes around symbols
 * and clusters as alphabets. He can also manually edit the generated boxes (not the clusters or alphabet though).
 * Additionally, the user can also reload the page and export out the project as a zip file.
 * This page is driven by a state machine, which handles the logic of the page. See more details on
 * this in the code below.
 * 
************************************************************************************************************/

"use strict";

import {
    save_boxes_to_server, placeBoxesOnImage, exportProjectPromise,
} from '../utils_js/state_utils.js';

import {
    queryImageProperties, initAllImages
} from '../utils_js/image_utils.js';

import {
    handleKeyDownEvents, handleKeyUpEvents, handleAddingBoxEvent,
} from '../utils_js/event_utils.js';

import {
    PROJECT_VIEW_URL, PRE_PROCESSING_VIEW_URL, IMAGE_PROCESSING_VIEW_URL, POST_PROCESSING_VIEW_URL, DOMAIN
} from '../config/config.js';

/*---------------------------------------------------------GLOBAL VARIABLES----------------------------------------------------------------------------*/

const project_id = send_to_frontend["project_id"]; // identifies the project
const save_id = send_to_frontend["save_id"]; // identifies the save
var lookup_table = send_to_frontend["lookup_table"]; // lookup table of the save
// lookup table of the project: holds the fine tuned models which belong not to the save, but to the project
var project_lookup_table = send_to_frontend["project_lookup_table"]; 

var bounding_boxes, transcription_json, generated_transcription_json; // objects storing the save's bounding boxes and transcription data
var initialImageSizes = {}; // width and height of the images
var imagePropertiesObject = {}; // object storing the properties of the images

const LOAD_JSON_PHP_PATH = send_to_frontend["LOAD_JSON_PHP_PATH"];
const SAVE_JSON_PHP_PATH = send_to_frontend["SAVE_JSON_PHP_PATH"];
const FETCH_TRANSCRIPTION_PHP_PATH = send_to_frontend["FETCH_TRANSCRIPTION_PHP_PATH"];
const RUN_ASYNC_PYTHON_CODE_PHP_PATH = send_to_frontend["RUN_ASYNC_PYTHON_CODE_PHP_PATH"];
const RUN_FEW_SHOT_PYTHON_CODE_PHP_PATH = send_to_frontend["RUN_FEW_SHOT_PYTHON_CODE_PHP_PATH"];

// for the Few-shot fine tuning algorithm
const base_models_for_fine_tuning = ["omniglot", "cipherglot-mix", "cipherglot-separated"]; // duplicated with DOM element id-s

const server_error_responses = {
    500 : "Something went wrong during the transfer of results, you may wait and then go back and reload the 'project view'. If that does not help, please try again.",
    504 : "The execution times out automatically after one hour, please close this window, go back to the 'project view', wait and after refreshing you should see in the logs that the results were transferred if the execution was successful.",
    502 : "The execution failed, please try again. If you still get this error, then please try to create a new save. Contact support if this error persists."
}

// for the async segmentation algorithm
var async_segmentation_parameters = {
    "segmentation_borg_setup": {
        "minDistLineSeg": 45,
        "thresLineSeg": 0.3,
        "thAboveBelowSymbol": 10,
        "thSizeCC": 10,
        "littleSymbol": false,
        "topBottomCheck": true,
        "leftRightCheck": true,
        "insideCheck": true,
        "combineLittleSymbols": true,
        "permitCollision": true,
        "specialSymbols_likely_surrounded": false
    },
    "segmentation_copiale_setup": {
        "minDistLineSeg": 120,
        "thresLineSeg": 0.05,
        "thAboveBelowSymbol": 25,
        "thSizeCC": 20,
        "littleSymbol": false,
        "topBottomCheck": true,
        "leftRightCheck": true,
        "insideCheck": true,
        "combineLittleSymbols": true,
        "permitCollision": true,
        "specialSymbols_likely_surrounded": false
    },
    "segmentation_digits_setup": {
        "minDistLineSeg": 70,
        "thresLineSeg": 0.05,
        "thAboveBelowSymbol": 25,
        "thSizeCC": 20,
        "littleSymbol": false,
        "topBottomCheck": true,
        "leftRightCheck": false,
        "insideCheck": false,
        "combineLittleSymbols": false,
        "permitCollision": true,
        "specialSymbols_likely_surrounded": false
    }
};


/*---------------------------------------------------------HELPER FUNCTIONS----------------------------------------------------------------------------*/


/**
 * Adds the user-given names of the fine-tuned models to the UI.
 * 
 * @param {object} param_list_of_fine_tuned_models - The parameter containing the list of fine-tuned models.
 */
const init_model_lists = (param_list_of_fine_tuned_models) => {

    // verify that it is an object
    if(typeof param_list_of_fine_tuned_models === 'object' && param_list_of_fine_tuned_models !== null && !Array.isArray(param_list_of_fine_tuned_models)){

        Object.keys(param_list_of_fine_tuned_models).forEach(key => {

            // the user given name is the value, and the server name is the key
            const new_model_radio_element = `<div>
                    <input id=few_shot_train_${key} type="radio" name="fewShotsModelRadio" value=${key}>
                    <label>${param_list_of_fine_tuned_models[key]}</label>   
                </div>`;

            const new_model_radio_element_train = `<div>
            <input id=few_shot_train_${key} type="radio" name="few_shot_train_model_radio" value=${key}>
            <label>${param_list_of_fine_tuned_models[key]}</label>   
            </div>`;

            // check if element is already added into the UI, only add it if it is not there yet
            if(!Array.from(document.querySelectorAll("#few_shot_train_model_selection input"), e => e.id).includes(`few_shot_train_${key}`)){

                document.querySelector("#fewShotsModelSelection").innerHTML += new_model_radio_element;
                document.querySelector("#few_shot_train_model_selection").innerHTML += new_model_radio_element_train;
            }
            
        });
    }
};


/**
 * Executes asynchronous Python code on the server and handles the response.
 * Receives the output and updates the global variables which store that
 * data (bounding_boxes, transcription_json).
 * @param {Object} payloadToServer - The payload to send to the server.
 * @returns {Promise} A promise that resolves or rejects with an error.
 */
const running_async_datech = (payloadToServer) => {

    console.log("payloadToServer=", payloadToServer);

    return fetch(RUN_ASYNC_PYTHON_CODE_PHP_PATH, {
        method: 'POST', 
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payloadToServer)
    }).then(response => {

        if (!response.ok) {
            if (response.status === 502) {
                throw { 
                    name: 'ServerError', 
                    message: server_error_responses["502"], 
                    is_custom_error: true 
                };
            }
            else{
                throw "unhandled network error";
            }
            
        }

        return response.json();
    }).then(data => {

        console.log(data);

        // if the Python code was successfully executed
        if(data.hasOwnProperty("success_flag") && data["success_flag"]){

            bounding_boxes = data["bounding_boxes"];
            transcription_json = data["transcription"];
            console.log("execute python code done");

        }
        else{ // in case of an error
            throw server_error_responses["502"];
        }
        
    }).catch(error => {

        console.log(error);

        if(error.hasOwnProperty("is_custom_error") && error["is_custom_error"]){ // looks for our custom error object with "server_error_responses[...]"
            functionInitErrorWidget(error["message"]);
        }
        else{
            functionInitErrorWidget("");
        }
    });

};

/*----------------------------------------------------STATE TRANSITION FUNCTIONS-----------------------------------------------------------------------*/

/**
 * Initializes the page and performs various tasks such as setting up links, fetching data from the server,
 * initializing images, and computing image properties.
 * @returns {Promise} A promise that resolves when all tasks are completed.
 */
const initPagePromise = () => {

    console.log("initPagePromise starts");

    document.querySelector("#redirectMainPage").href = `${PROJECT_VIEW_URL}?project_id=${project_id}`;
    document.querySelector("#redirectPreProcPage").href = `${PRE_PROCESSING_VIEW_URL}?project_id=${project_id}&save_id=${save_id}`;
    document.querySelector("#redirectEditingPage").href = `${POST_PROCESSING_VIEW_URL}?project_id=${project_id}&save_id=${save_id}`;
    document.querySelector("#pageTitle").textContent = `Project: ${lookup_table["user_given_project_name"]} - ${lookup_table["user_given_save_name"]}`;

    // add existing fine tuned models to UI
    init_model_lists(project_lookup_table["fine_tuned_model_name_mapping"]);

    const payloadToServer = {
        "project_id": project_id,
        "save_id": save_id
    };

    $("#loadingStateWrapper").removeClass("hideElement");

    return fetch(LOAD_JSON_PHP_PATH, {
        method: 'POST', 
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payloadToServer)
    }).then(response => {
        return response.json()
    }).then(data => {

        bounding_boxes = data["bounding_boxes"]; 
        transcription_json = data["transcription"];
        
        console.log("json data=", data);

        console.log("lookup_table = ", lookup_table);
        console.log("project_lookup_table = ", project_lookup_table);

        $("#asyncLineSegmentationDropdownState").addClass("activeBlock");

        return initAllImages(project_id, save_id, DOMAIN, lookup_table["image_name_mapping"]);
    }).then(() => {

        return new Promise((resolve, reject) => { 
            setTimeout(function(){
                resolve();
            }, 500); //wait 500 ms, as images are sometimes not loaded correctly in time, and so the image height could become zero
        });
        
    }).then(() => {

        const listOfLoadedImages = document.querySelectorAll(".b_image");

        listOfLoadedImages.forEach((element) => {
            
            initialImageSizes[element.id] = {};
            initialImageSizes[element.id]["width"] =  element.width;
            initialImageSizes[element.id]["height"] =  element.height;
            element.classList.remove("invisibleElement");
        });

        console.log(initialImageSizes);

        for (let index = 0; index < listOfLoadedImages.length; index++) {
            const quiredProps = queryImageProperties(`#${listOfLoadedImages[index].id}`);
            imagePropertiesObject[quiredProps["imageFullName"]] = quiredProps;
            
        }
        
        console.log(imagePropertiesObject);
        console.log("initPagePromise done");
        
    }).catch(error => {
        console.log(error);
        functionInitErrorWidget("");
    });
};

// *---------------------------------------------------- LINE SEGMENTATION


/**
 * Initializes the asynchronous line segmentation state: places boxes on the image
 * based on the data from the server.
 * @returns {Promise} A promise that resolves once the task is completed.
 */
const initAsyncLineSegmentationPromise = () => {

    console.log("initAsyncLineSegmentationPromise starts");

    return placeBoxesOnImage(project_id, save_id, imagePropertiesObject, "asyncLineSegmentation", LOAD_JSON_PHP_PATH, SAVE_JSON_PHP_PATH).then((data) => {

        transcription_json = data;
        $("#loadingStateWrapper").addClass("hideElement");
        $("#asyncLineSegmentationStateWrapper").removeClass("hideElement"); 
        console.log("initAsyncLineSegmentationPromise done");
        
    }).catch(error => {
        console.log(error) 
        functionInitErrorWidget("");
    });  
    
};

/**
 * Checks the user's parameter setup and executes in the backend the line segmentation algorithm.
 * 
 * @returns {Promise} A promise that resolves when the execution is complete.
 */
const executeBackendAsyncLineSegmentationPromise = () => {

    console.log("executeBackendAsyncLineSegmentationPromise starts");

    const selectedSetup = ($(`input[name="lineRadio"]:checked`).val() === "true"); // checks user input

    let no_segmented_lines = false;

    // in the case of "use a few consecutive segmented lines" option, checking if at least one line is selected on each image
    if(selectedSetup){
        Object.keys(bounding_boxes["documents"]).forEach(key => {

            const regular_boxes = bounding_boxes["documents"][key].filter(e => !e.hasOwnProperty("frozen")); // we filter out the frozen boxes

            if(regular_boxes.length < 1){
                no_segmented_lines = true;
            }
        });
    }

    if(selectedSetup && no_segmented_lines){
        functionInitErrorWidget("Warning: please make sure to select at least one line on each image in this parameter setup.");
        return new Promise((resolve, reject) => { //return empty promise to keep the state machine going
            resolve();
        });
    }

    const execution_parameters_to_server = {
        "executingScript": "asyncLineSegmentation",
        "two_segmented_lines": selectedSetup,
    };

    const payloadToServer = {
        "project_id": project_id,
        "save_id": save_id,
        "execution_parameters_to_server": execution_parameters_to_server
    };

    return running_async_datech(payloadToServer);
};

// *---------------------------------------------------- FEW-SHOT

/**
 * Initializes the asynchronous Few-shot prediction state: places boxes on the image
 * based on the data from the server.
 * @returns {Promise} A promise that resolves once the task is completed.
 */
const initFewShotsPromise = () => {
    console.log("initFewShotsPromise starts");

    return placeBoxesOnImage(project_id, save_id, imagePropertiesObject, "fewShots", LOAD_JSON_PHP_PATH, SAVE_JSON_PHP_PATH).then((data_out) => {
        
        transcription_json = data_out;
        $("#loadingStateWrapper").addClass("hideElement");
        $("#fewShotsStateWrapper").removeClass("hideElement"); 
        console.log("initFewShotsPromise done");
        
    }).catch(error => {
        console.log(error) 
        functionInitErrorWidget("");
    });  
    
};

/**
 * Checks the user's parameter setup and executes in the backend the Few-shot prediction algorithm.
 * Receives the output and updates the global variables which store that
 * data (bounding_boxes, transcription_json, and generated_transcription_json).
 * Handles various errors related to the infrastructure setup of a separate web server and GPU server.
 * @returns {Promise} A promise that resolves when the execution is complete.
 */
const executeBackendFewShotsPromise = () => {

    console.log("executeBackendFewShotsPromise starts");

    // checking user input
    const selectedAlphabetFewShots = $(`input[name="fewShotsAlphabetRadio"]:checked`).val();
    const selectedModelFewShots = $(`input[name="fewShotsModelRadio"]:checked`).val();
    const selected_model_user_given_name = document.querySelector("#fewShotsModelSelection input:checked ~ label").textContent;
    const fewShotReadSpacesBool = parseInt($(`input[name="fewShotReadSpaceBool"]:checked`).val());
    const numberOfShots = parseInt(document.querySelector("#numberOfShots").value);
    const thresholdFewShots = parseFloat(document.querySelector("#thresholdFewShots").value);

    if(!(thresholdFewShots >= 0.01 && thresholdFewShots <= 1)){
        functionInitErrorWidget("Warning: please make sure to select a threshold between 0.01 and 1.");
        return new Promise((resolve, reject) => { //return empty promise to keep the state machine going
            resolve();
        });
    }

    if(!(numberOfShots >= 1 && numberOfShots <= 5)){
        functionInitErrorWidget("Warning: please make sure to set the number of shots between 1 and 5.");
        return new Promise((resolve, reject) => { //return empty promise to keep the state machine going
            resolve();
        });
    }

    const execution_parameters_to_server = {
        "executingScript": "test_few_shot",
        "numberOfShots": numberOfShots,
        "thresholdFewShots": thresholdFewShots,
        "selectedAlphabetFewShots": selectedAlphabetFewShots,
        "selectedModelFewShots": selectedModelFewShots,
        "selected_model_user_given_name": selected_model_user_given_name,
        "fewShotReadSpacesBool": fewShotReadSpacesBool,
    };

    const payloadToServer = {
        "project_id": project_id,
        "save_id": save_id,
        "execution_parameters_to_server": execution_parameters_to_server
    };

    console.log("payload to server = ", payloadToServer);

    return fetch(RUN_FEW_SHOT_PYTHON_CODE_PHP_PATH, {
        method: 'POST', 
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payloadToServer)
    }).then(response => {

        if (!response.ok) {
            if (response.status === 500) { // failed to transfer files between servers
                throw { 
                    name: 'ServerError', 
                    message: server_error_responses["500"], 
                    is_custom_error: true 
                };
            }
            else if (response.status === 502) { // python execution failed
                throw { 
                    name: 'ServerError', 
                    message: server_error_responses["502"], 
                    is_custom_error: true 
                };
            }
            else if (response.status === 504) { // python execution timed out
                throw { 
                    name: 'ServerError', 
                    message: server_error_responses["504"], 
                    is_custom_error: true 
                };
            }
            else{
                throw "unhandled network error";
            }
            
        }

        return response.json();
    }).then(data => {

        console.log(data);

        // if the Python code was successfully executed
        if(data.hasOwnProperty("success_flag") && data["success_flag"]){

            bounding_boxes = data["bounding_boxes"];
            transcription_json = data["transcription"];
            generated_transcription_json = data["generated_transcription"];
            console.log("executeBackendFewShotsPromise done");

        }
        else{ // in case of an error
            throw server_error_responses["502"];
        }
            
    }).catch(error => {

        console.log(error);
        if(error.hasOwnProperty("is_custom_error") && error["is_custom_error"]){ // looks for our custom error object with "server_error_responses[...]"
            functionInitErrorWidget(error["message"]);
        }
        else{
            functionInitErrorWidget("");
        }

    });

};

// *---------------------------------------------------- FEW-SHOT TRAIN

/**
 * Initializes the asynchronous Few-shot fine-tuning state: places boxes on the image
 * based on the data from the server.
 * @returns {Promise} A promise that resolves once the task is completed.
 */
const init_few_shot_train_promise = () => {
    console.log("initFewShotsPromise starts");

    return placeBoxesOnImage(project_id, save_id, imagePropertiesObject, "few_shot_train", LOAD_JSON_PHP_PATH, SAVE_JSON_PHP_PATH).then((data) => {
        
        transcription_json = data;
        $("#loadingStateWrapper").addClass("hideElement");
        $("#few_shot_train_state_wrapper").removeClass("hideElement"); 
        console.log("init_few_shot_train_promise done");
        
    }).catch(error => {
        console.log(error) 
        functionInitErrorWidget("");
    });  
    
};

/**
 * Checks the user's parameter setup and executes in the backend the Few-shot fine-tuning algorithm.
 * Receives the output and updates the global variables which store that
 * data (bounding_boxes, transcription_json, and generated_transcription_json).
 * Handles various errors related to the infrastructure setup of a separate web server and GPU server.
 * @returns {Promise} A promise that resolves when the execution is complete.
 */
const execute_backend_few_shot_train_promise = () => {

    console.log("execute_backend_few_shot_train_promise starts");

    // checking user input
    const user_validation_flag = parseInt($(`input[name="user_validation_flag"]:checked`).val()); 
    const selectedAlphabetFewShots = $(`input[name="few_shot_train_alphabet_radio"]:checked`).val(); 
    const selectedModelFewShots = $(`input[name="few_shot_train_model_radio"]:checked`).val();
    let few_shot_train_new_model_name = document.querySelector("#few_shot_train_new_model_name").value;
    const selected_model_user_given_name = document.querySelector("#few_shot_train_model_selection input:checked ~ label").textContent;
    const few_shot_train_epochs = parseInt(document.querySelector("#few_shot_train_epochs").value);

    if(!base_models_for_fine_tuning.includes(selectedModelFewShots)){
        few_shot_train_new_model_name = project_lookup_table["fine_tuned_model_name_mapping"][selectedModelFewShots];
    }

    if(few_shot_train_new_model_name === ""){
        functionInitErrorWidget("Warning: please enter a new model name.");
        return new Promise((resolve, reject) => { //return empty promise to keep the statechart going
            resolve();
        });
    }
    
    if(base_models_for_fine_tuning.includes(selectedModelFewShots) && Object.values(project_lookup_table["fine_tuned_model_name_mapping"]).includes(few_shot_train_new_model_name)){
        functionInitErrorWidget("Warning: there is already a fined tuned model with this name, please enter a different name.");
        return new Promise((resolve, reject) => { //return empty promise to keep the statechart going
            resolve();
        });
    }

    if(!(few_shot_train_epochs >= 1 && few_shot_train_epochs <= 20)){
        functionInitErrorWidget("Warning: please make sure to set the number of epochs between 1 and 20.");
        return new Promise((resolve, reject) => { //return empty promise to keep the statechart going
            resolve();
        });
    }

    const execution_parameters_to_server = {
        "executingScript": "few_shot_train",
        "user_validation_flag": user_validation_flag,
        "numberOfShots": 5,
        "thresholdFewShots": 0.4,
        "selectedAlphabetFewShots": selectedAlphabetFewShots,
        "selectedModelFewShots": selectedModelFewShots,
        "selected_model_user_given_name": selected_model_user_given_name,
        "few_shot_train_new_model_name": few_shot_train_new_model_name,
        "few_shot_train_epochs": few_shot_train_epochs,
        "fewShotReadSpacesBool": 0,
    };


    const payloadToServer = {
        "project_id": project_id,
        "save_id": save_id,
        "execution_parameters_to_server": execution_parameters_to_server
    };

    console.log(execution_parameters_to_server);

    return fetch(RUN_FEW_SHOT_PYTHON_CODE_PHP_PATH, {
        method: 'POST', 
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payloadToServer)
    }).then(response => {
        
        if (!response.ok) {
            if (response.status === 500) { // failed to transfer files between servers
                throw { 
                    name: 'ServerError', 
                    message: server_error_responses["500"], 
                    is_custom_error: true 
                };
            }
            else if (response.status === 502) { // python execution failed
                throw { 
                    name: 'ServerError', 
                    message: server_error_responses["502"], 
                    is_custom_error: true 
                };
            }
            else if (response.status === 504) { // python execution timed out
                throw { 
                    name: 'ServerError', 
                    message: server_error_responses["504"], 
                    is_custom_error: true 
                };
            }
            else{
                throw "unhandled network error";
            }
            
        }

        return response.json();
    }).then(data => {

        console.log(data);

        // if the Python code was successfully executed
        if(data.hasOwnProperty("success_flag") && data["success_flag"]){

            project_lookup_table = data["project_lookup_table"];
            console.log(project_lookup_table);
            init_model_lists(project_lookup_table["fine_tuned_model_name_mapping"]);
            
            bounding_boxes = data["bounding_boxes"];
            transcription_json = data["transcription"];
            generated_transcription_json = data["generated_transcription"];

            console.log("execute_backend_few_shot_train_promise done");
        }
        else{ // in case of an error
            throw server_error_responses["502"];
        }
            
    }).catch(error => {

        console.log(error);
        if(error.hasOwnProperty("is_custom_error") && error["is_custom_error"]){ // looks for our custom error object with "server_error_responses[...]"
            functionInitErrorWidget(error["message"]);
        }
        else{
            functionInitErrorWidget("");
        }

    });

};

// *---------------------------------------------------- SEGMENTATION

/**
 * Initializes the asynchronous segmentation state: places boxes on the image
 * based on the data from the server.
 * @returns {Promise} A promise that resolves once the task is completed.
 */
const initAsyncSegmentationPromise = () => {
    console.log("initAsyncSegmentationPromise starts");

    return placeBoxesOnImage(project_id, save_id, imagePropertiesObject, "asyncSegmentation", LOAD_JSON_PHP_PATH, SAVE_JSON_PHP_PATH).then((data) => {
        
        transcription_json = data;
        $("#loadingStateWrapper").addClass("hideElement");
        $("#asyncSegmentationStateWrapper").removeClass("hideElement"); 
        console.log("initAsyncSegmentationPromise done");
        
    }).catch(error => {
        console.log(error) 
        functionInitErrorWidget("");
    });  
    
};

/**
 * Checks the user's parameter setup and executes in the backend the segmentation algorithm.
 * 
 * @returns {Promise} A promise that resolves when the execution is complete.
 */
const executeBackendAsyncSegmentationPromise = () => {

    console.log("executeBackendAsyncSegmentationPromise starts");

    // checking user input
    const minDistLineSeg = parseInt(document.querySelector("#minDistLineSeg").value);
    const thAboveBelowSymbol = parseInt(document.querySelector("#thAboveBelowSymbol").value);
    const thSizeCC = parseInt(document.querySelector("#thSizeCC").value);

    if(!(minDistLineSeg >= 1 && minDistLineSeg <= 500)){
        functionInitErrorWidget("Warning: please make sure to set the minimum pixel distance between lines to a number between 1 and 500.");
        return new Promise((resolve, reject) => { //return empty promise to keep the state machine going
            resolve();
        });
    }

    if(!(thAboveBelowSymbol >= 1 && thAboveBelowSymbol <= 100)){
        functionInitErrorWidget("Warning: please make sure to set the maximal pixel gap size inside symbols to a number between 1 and 100.");
        return new Promise((resolve, reject) => { //return empty promise to keep the state machine going
            resolve();
        });
    }

    if(!(thSizeCC >= 1 && thSizeCC <= 200)){
        functionInitErrorWidget("Warning: please make sure to set the minimum area of symbols to a number between 1 and 200.");
        return new Promise((resolve, reject) => { //return empty promise to keep the state machine going
            resolve();
        });
    }

    const execution_parameters_to_server = {
        "executingScript": "asyncSegmentation",
        "minDistLineSeg": minDistLineSeg,
        "thresLineSeg": 0.05,
        "thAboveBelowSymbol": thAboveBelowSymbol,
        "thSizeCC": thSizeCC,
        "littleSymbol": document.querySelector("#littleSymbol").checked,
        "topBottomCheck": document.querySelector("#topBottomCheck").checked,
        "leftRightCheck": document.querySelector("#leftRightCheck").checked,
        "insideCheck": document.querySelector("#insideCheck").checked,
        "combineLittleSymbols": document.querySelector("#combineLittleSymbols").checked,
        "permitCollision": document.querySelector("#permitCollision").checked,
        "specialSymbols_likely_surrounded": document.querySelector("#specialSymbols_likely_surrounded").checked
    };

    const payloadToServer = {
        "project_id": project_id,
        "save_id": save_id,
        "execution_parameters_to_server": execution_parameters_to_server
    };

    return running_async_datech(payloadToServer);

};

// *---------------------------------------------------- CLUSTERING

/**
 * Initializes the asynchronous clustering state: places boxes on the image
 * based on the data from the server.
 * @returns {Promise} A promise that resolves once the task is completed.
 */
const initAsyncClusteringPromise = () => {
    console.log("initAsyncClusteringPromise starts");

    return placeBoxesOnImage(project_id, save_id, imagePropertiesObject, "asyncClustering", LOAD_JSON_PHP_PATH, SAVE_JSON_PHP_PATH).then((data) => {
        
        transcription_json = data;
        $("#loadingStateWrapper").addClass("hideElement");
        $("#asyncClusteringStateWrapper").removeClass("hideElement"); 
        console.log("initAsyncClusteringPromise done");
        
    }).catch(error => {
        console.log(error) 
        functionInitErrorWidget("");
    });  
    
};

/**
 * Checks the user's parameter setup and executes in the backend the clustering algorithm.
 * 
 * @returns {Promise} A promise that resolves when the execution is complete.
 */
const executeBackendAsyncClusteringPromise = () => {

    console.log("executeBackendAsyncClusteringPromise starts");

    // checking user input
    const minImages = parseInt(document.querySelector("#minImages").value);

    if(!(minImages >= 1 && minImages <= 100)){
        functionInitErrorWidget("Warning: please make sure to set the minimum number of boxes per cluster to a number between 1 and 100.");
        return new Promise((resolve, reject) => { //return empty promise to keep the state machine going
            resolve();
        });
    }

    const execution_parameters_to_server = {
        "executingScript": "asyncClustering",
        "minImages": minImages,
    };

    const payloadToServer = {
        "project_id": project_id,
        "save_id": save_id,
        "execution_parameters_to_server": execution_parameters_to_server
    };

    return running_async_datech(payloadToServer);

};

// *---------------------------------------------------- LABEL PROPAGATION

/**
 * Initializes the asynchronous label propagation state: places boxes on the image
 * based on the data from the server.
 * @returns {Promise} A promise that resolves once the task is completed.
 */
const initAsyncLabelPropagationPromise = () => {
    console.log("initAsyncLabelPropagationPromise starts");

    return placeBoxesOnImage(project_id, save_id, imagePropertiesObject, "asyncLabelPropagation", LOAD_JSON_PHP_PATH, SAVE_JSON_PHP_PATH).then((data) => {
        
        transcription_json = data;
        $("#loadingStateWrapper").addClass("hideElement");
        $("#asyncLabelPropagationStateWrapper").removeClass("hideElement"); 
        console.log("initAsyncLabelPropagationPromise done");
        
    }).catch(error => {
        console.log(error) 
        functionInitErrorWidget("");
    });  

};

/**
 * Checks the user's parameter setup and executes in the backend the label propagation algorithm.
 * 
 * @returns {Promise} A promise that resolves when the execution is complete.
 */
const executeBackendAsyncLabelPropagationPromise = () => {

    console.log("executeBackendAsyncLabelPropagationPromise starts");

    // checks user input
    const alphaLabelPropagation = parseFloat(document.querySelector("#alphaLabelPropagation").value); 

    if(!(alphaLabelPropagation >= 0.01 && alphaLabelPropagation <= 1)){
        functionInitErrorWidget("Warning: please make sure to set the alpha (change) threshold to a number between 0.01 and 1.");
        return new Promise((resolve, reject) => { //return empty promise to keep the state machine going
            resolve();
        });
    }

    const execution_parameters_to_server = {
        "executingScript": "asyncLabelPropagation",
        "alphaLabelPropagation": alphaLabelPropagation,
    };

    const payloadToServer = {
        "project_id": project_id,
        "save_id": save_id,
        "execution_parameters_to_server": execution_parameters_to_server
    };

    return running_async_datech(payloadToServer);

};

// *---------------------------------------------------- OTHER FUNCTIONS


/**
 * Saves the boxes to the server and updates the bounding boxes and transcription JSON files.
 * @returns {Promise} A promise that resolves when the saving is complete.
 */
const saveBoxPromise = () => {
    
    console.log("saveBoxPromise starts");

    //clear up UI elements
    $(".stateWrapper").addClass("hideElement"); //hides all stateWrapper UI elements
    $("#loadingStateWrapper").removeClass("hideElement");

    //remove dragging utility from boxes
    document.querySelectorAll(".draggable_resizable_object").forEach(e => e.classList.remove("draggable_resizable_object"));
    
    return save_boxes_to_server(project_id, save_id, bounding_boxes, transcription_json, imagePropertiesObject, SAVE_JSON_PHP_PATH).then(data => {

        bounding_boxes = data["bounding_boxes"];
        transcription_json = data["transcription"];
        console.log("saveBoxPromise done");

    }).catch(error => {
        console.log(error);
        functionInitErrorWidget("");
    });
};

/**
 * Reloads the page based on the data from the server.
 * @returns {Promise} A promise that resolves when the page is reloaded and the data is fetched successfully.
 */
const reloadPagePromise = () => {

    //clear up UI elements
    $(".stateWrapper").addClass("hideElement"); //hides all stateWrapper UI elements
    $("#loadingStateWrapper").removeClass("hideElement");

    //remove dragging utility from boxes
    document.querySelectorAll(".draggable_resizable_object").forEach(e => e.classList.remove("draggable_resizable_object"));

    console.log("reloadPagePromise starts");

    const payloadToServer = {
        "project_id": project_id,
        "save_id": save_id
    };

    return fetch(LOAD_JSON_PHP_PATH, {
        method: 'POST', 
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payloadToServer)
    }).then(response => {
        return response.json()
    }).then(data => {

        bounding_boxes = data["bounding_boxes"];
        transcription_json = data["transcription"];
        console.log("data=", data);
        console.log("reloadPagePromise done");

    }).catch(error => {
        console.log(error) 
        functionInitErrorWidget("");
    });
};

/**
 * Exports out the project to the user.
 * 
 * @returns {Promise} A promise that resolves when the export is complete.
 */
const exportProjectPromiseWrapper = () => {

    console.log("exportProjectPromiseWrapper starts");

    //clear up UI elements
    $(".stateWrapper").addClass("hideElement"); //hides all stateWrapper UI elements
    $("#loadingStateWrapper").removeClass("hideElement");

    return exportProjectPromise(project_id, save_id, lookup_table, bounding_boxes, transcription_json, DOMAIN, FETCH_TRANSCRIPTION_PHP_PATH).then(() => {

        console.log("exportProjectPromiseWrapper done");
    }).catch(error => {
        console.log(error) 
        functionInitErrorWidget("");
    });
};

/**
 * Initializes the error widget with the given error text and thrown error.
 * @param {string} errorText - The error text to display in the error widget.
 * @param {Error} thrownError - The thrown error object. Not used now.
 */
const functionInitErrorWidget = (errorText, thrownError) => {

    if(typeof errorText === "string" && errorText !== "" ){
        document.querySelector(".errorText").textContent = errorText;
    }
    else{
        document.querySelector(".errorText").textContent = `An error ocurred, please try again or contact the developer team.`;
    }
    
    document.querySelector(".errorWidget").classList.add("onclickErrorWidget");
};

/**
 * Hides the error widget.
 */
const functionExitErrorWidget = () => {
    console.log("functionExitErrorWidget starts");

    document.querySelector(".errorWidget").classList.remove("onclickErrorWidget");
    
    console.log("functionExitErrorWidget done");
};

/**
 * Handles various click events related (mostly) to the appearance of the boxes.
 * Frozen boxes were introduced to enable an iterative fine-tuning of Few-shot models.
 * See the README.md for more details on this use case.
 * Frozen boxes: are inactive, they do not participate in the image processing.
 * Regular boxes: are active, they participate in the image processing.
 * Note: a box can either be one or the other at any given time.
 * @param {Event} event - The click event object.
 */
function handleClickEvents (event) {

    if(event.target.id === "addBoxButton"){ // add a new box to the image
        handleAddingBoxEvent(event, null, imagePropertiesObject, "image_processing");
    }
    else if(event.target.id === "removeBoxButton"){ // remove selected boxes
        document.querySelectorAll(".clicked_border").forEach(e => e.remove());
    }
    else if(event.target.id === "removeAllBoxButton"){ // remove all regular boxes
        document.querySelectorAll(".boxes:not(.frozen)").forEach(e => e.remove());
    }
    else if(event.target.id === "swap_selection_button"){ // swap the selection of regular boxes
        document.querySelectorAll(".boxes:not(.frozen)").forEach(e => {
            if(e.classList.contains("clicked_border")){
                e.classList.remove("clicked_border");
            }
            else{
                e.classList.add("clicked_border");
            }
        });
    }
    else if(event.target.id === "swap_frozen_selection_button"){ // swap the selection of frozen boxes
        document.querySelectorAll(".boxes.frozen").forEach(e => {
            if(e.classList.contains("clicked_border")){
                e.classList.remove("clicked_border");
            }
            else{
                e.classList.add("clicked_border");
            }
        });
    }
    else if(event.target.id === "freeze_button"){ // make selected regular boxes "frozen" and selected frozen boxes regular
        document.querySelectorAll(".boxes.clicked_border").forEach(e => {

            e.classList.remove("clicked_border");

            if(e.classList.contains("frozen")){
                e.classList.remove("frozen");
            }
            else{
                e.classList.add("frozen");
            }
        });
    }
}

/**
 * If box has been selected, then remove selection, if not add selection.
 * Also remove selection from any other box.
 * @param {Event} event - The event object.
 */
function handleMouseDownEvents (event) {

    if(event.target.classList.contains("boxes")){
        
        if(event.target.classList.contains("clicked_border")){
            event.target.classList.remove("clicked_border");
        }
        else{
            event.target.classList.add("clicked_border");
        }
    }
}

/**
 * Handles different change events.
 * 
 * @param {Event} event - The event object triggered by the UI element.
 */
function handleChangeEvent (event) {

    const fine_tune_base_models = ["few_shot_train_omniglot", "few_shot_train_cipherglot-mix", "few_shot_train_cipherglot-separated"]; // duplicated in global vars ("base_models_for_fine_tuning")

    // Hide or show the new model name input field for the Few-shot train UI
    // depending on if the user selected a base model or an already fine-tuned model.
    // Only from the base models can the user create a new model.
    if(event.target.name === "few_shot_train_model_radio"){
        if(fine_tune_base_models.includes(event.target.id)){
            document.querySelector("#wrapper_few_shot_train_new_model_name").classList.remove("hideElement");
        }
        else{
            document.querySelector("#wrapper_few_shot_train_new_model_name").classList.add("hideElement");
        }
    }

    // hide or show the detailed parameter setup for the async segmentation UI
    if(event.target.id === "show_hide_parameters"){
        if(document.querySelector("#show_hide_parameters").checked){
            document.querySelector("#async_segmentation_inner_state_wrapper").classList.remove("hideElement");
        }
        else{
            document.querySelector("#async_segmentation_inner_state_wrapper").classList.add("hideElement");
        }
    }

    // updates the values of the UI elements of the async segmentation parameters
    // based on the global variable "async_segmentation_parameters"
    if(event.target.name === "asyncSegmentationRadio"){

        const setup_key = event.target.id; // the keys and the id-s are set up to be the same

        Object.keys(async_segmentation_parameters[setup_key]).forEach(key => {

            const setup_elem = document.querySelector(`#${key}`);
            if(setup_elem !== null){
                if(setup_elem.type === "checkbox"){
                    setup_elem.checked = async_segmentation_parameters[setup_key][key];
                }
                else{
                    setup_elem.value = async_segmentation_parameters[setup_key][key];
                }
            }
            
        });

    }
}

const imageProcPageHandleKeyUpEvents = (event) => handleKeyUpEvents(event, null, imagePropertiesObject, "image_processing");

const functionActivateDragDropChangingHandler = () => {

    document.addEventListener('click', handleClickEvents);

    document.addEventListener('mousedown', handleMouseDownEvents);

    document.addEventListener('keydown', handleKeyDownEvents);

    document.addEventListener('keyup', imageProcPageHandleKeyUpEvents);

    document.addEventListener('change', handleChangeEvent);

};

const {Machine, interpret, assign} = XState;

/**
 * The webpage is driven by a state machine. Most of the logic is handled by the state machine
 * with a few exceptions (like handling the "menu" button). 
 *
 * @typedef {Object} WebPageMachine
 * @property {Object} states - The states of the machine:
 *      - active: contains the main states which execute the logic of the page.
 *          - hist: functional state that keeps track of the history of the active state, so that we could return to the last "active" state even
 * after entering another state outside of the "active" state, like "reloadPage" or "globalErrorState".
 *          - imageInit: loads the image and initializes the page. It is a transitional state which only runs once.
 *          - asyncLineSegmentation: handles the line segmentation. It has three sub-states: "init", "ready", and "execute". For most
 * state transitions, it first goes into its "saving" sub-state and then continues to the targeted state.
 *             - init: initializes the state, then transitions to "ready".
 *             - ready: the state is ready to accept user input. It has many triggers to transition to other states.
 *             - execute: executes the logic or "goal" of the state: this means usually to run an image processing
 * algorithm. When done returns back to "init".
 *          - fewShots: handles the Few-shot prediction. Has the same state logic as the "asyncLineSegmentation", see above its description.
 *          - few_shot_train: handles the Few-shot fine-tuning. Has the same state logic as the "asyncLineSegmentation", see above its description.
 *          - asyncSegmentation: handles the segmentation. Has the same state logic as the "asyncLineSegmentation", see above its description.
 *          - asyncClustering: handles the clustering. Has the same state logic as the "asyncLineSegmentation", see above its description.
 *          - asyncLabelPropagation: handles the label propagation. Has the same state logic as the "asyncLineSegmentation", see above its description.
 *      - reloadPage: reloads the entire page with the data from the server. When done returns back through the "hist" state
 * to the last "active" state. This is usually one of the "active" states (e.g., "fewShots").
 *      - exportProject: exports the project as a zip file. When done returns back through the "hist" state
 * to the last "active" state. This is usually one of the "active" states (e.g., "fewShots").
 *      - globalErrorState: handles all the errors that occur in any other state. When done returns back through the "hist" state
 * to the last "active" state. This is usually one of the "active" states (e.g., "fewShots").
 * @property {Object} actions - The actions are performed on entering or exiting states. See them defined under "entry" or "exit" properties in the states.
 * @property {Object} services - The services are the logic of the states. They are defined as functions that return promises. See them in the "src" properties of the states.
 */
const webPageMachine = Machine({
    initial: 'active',
    context: {
        stateQueue : "",
        parentState: ""
    },
    states: {
        active: {
            initial: 'imageInit',
            id: 'active',
            states: {
                hist: {type: 'history', history: 'shallow'},
                imageInit: { 
                    invoke: {
                        src: initPagePromise, 
                        onDone: {target: "#asyncLineSegmentation"}
                    } 
                },
                asyncLineSegmentation: {
                    id: 'asyncLineSegmentation',
                    initial: 'init',
                    on: { ERROREVENT: '#globalErrorState' },
                    states: {
                        init: {
                            id: 'asyncLineSegmentationInit',
                            invoke: {
                                src: initAsyncLineSegmentationPromise,
                                onDone: 'ready'
                            }
                        },
                        ready: { 
                            entry: ['activateDragDropChangingHandler'],
                            initial: 'pending', 
                            states: {
                                pending: {
                                    on: {
                                        ASYNC_LINE_SEGMENTATION_BUTTON_PRESS: {target: 'saving', actions: assign({stateQueue: '#asyncLineSegmentationExecute', parentState: 'asyncLineSegmentation'})}, 
                                        TRANSITION_TO_ASYNC_SEGMENTATION: {target: 'saving', actions: assign({stateQueue: '#asyncSegmentation', parentState: 'asyncLineSegmentation'})},
                                        TRANSITION_TO_FEW_SHOTS: {target: 'saving', actions: assign({stateQueue: '#fewShots', parentState: 'asyncLineSegmentation'})},
                                        TRANSITION_TO_FEW_SHOT_TRAIN: {target: 'saving', actions: assign({stateQueue: '#few_shot_train', parentState: 'asyncLineSegmentation'})},
                                        TRANSITION_TO_ASYNC_CLUSTERING: {target: 'saving', actions: assign({stateQueue: '#asyncClustering', parentState: 'asyncLineSegmentation'})},
                                        TRANSITION_TO_ASYNC_LABEL_PROPAGATION: {target: 'saving', actions: assign({stateQueue: '#asyncLabelPropagation', parentState: 'asyncLineSegmentation'})},
                                        RELOAD_PAGE_BUTTON_PRESS: {target: '#reloadPage', actions: assign({parentState: 'asyncLineSegmentation'})},
                                        EXPORT_PROJECT_BUTTON_PRESS: {target: 'saving', actions: assign({stateQueue: '#exportProject'})},
                                        USER_SAVE_BUTTON_PRESS: {target: 'saving', actions: assign({stateQueue: '#asyncLineSegmentationInit', parentState: 'asyncLineSegmentation'})},
                                    },
                                    exit: ['deactivateDragDropChangingHandler'],
                                },
                                saving: {
                                    invoke: {
                                        src: (context, event) => saveBoxPromise(context.parentState), 
                                        onDone: [
                                            {target: '#asyncLineSegmentationExecute', cond: (context, event) => context.stateQueue === "#asyncLineSegmentationExecute"}, 
                                            {target: '#asyncLineSegmentationInit', cond: (context, event) => context.stateQueue === "#asyncLineSegmentationInit"},
                                            {target: '#fewShots', cond: (context, event) => context.stateQueue === "#fewShots"},
                                            {target: '#few_shot_train', cond: (context, event) => context.stateQueue === "#few_shot_train"},
                                            {target: '#asyncSegmentation', cond: (context, event) => context.stateQueue === "#asyncSegmentation"},
                                            {target: '#asyncClustering', cond: (context, event) => context.stateQueue === "#asyncClustering"},
                                            {target: '#asyncLabelPropagation', cond: (context, event) => context.stateQueue === "#asyncLabelPropagation"},
                                            {target: '#exportProject', cond: (context, event) => context.stateQueue === "#exportProject"},
                            // if no guard evaluates to true then go to error state, just to keep the state machine going, otherwise it would get stuck here
                                            {target: '#globalErrorState'} 
                                        ]
                                    } 
                                }
                            },
                            exit: ['clearContext']  
                        },
                        execute: {
                            id: 'asyncLineSegmentationExecute',
                            invoke: {
                                src: executeBackendAsyncLineSegmentationPromise,
                                onDone: {target: 'init'}
                            },
                        }
                    }
                },
                fewShots: {
                    id: 'fewShots',
                    initial: 'init',
                    on: { ERROREVENT: '#globalErrorState' },
                    states: {
                        init: {
                            id: 'fewShotsInit',
                            invoke: {
                                src: initFewShotsPromise,
                                onDone: 'ready'
                            }
                        },
                        ready: { 
                            entry: ['activateDragDropChangingHandler'],
                            initial: 'pending', 
                            states: {
                                pending: {
                                    on: {
                                        FEW_SHOTS_BUTTON_PRESS: {target: 'saving', actions: assign({stateQueue: '#fewShotsExecute', parentState: 'fewShots'})}, 
                                        PAGECHANGEPRESS: {target: 'saving', actions: assign({stateQueue: '#fewShotsInit', parentState: 'fewShots'})},
                                        TRANSITION_TO_ASYNC_SEGMENTATION: {target: 'saving', actions: assign({stateQueue: '#asyncSegmentation', parentState: 'fewShots'})},
                                        TRANSITION_TO_ASYNC_LINE_SEGMENTATION: {target: 'saving', actions: assign({stateQueue: '#asyncLineSegmentation', parentState: 'fewShots'})},
                                        TRANSITION_TO_FEW_SHOT_TRAIN: {target: 'saving', actions: assign({stateQueue: '#few_shot_train', parentState: 'fewShots'})},
                                        TRANSITION_TO_ASYNC_CLUSTERING: {target: 'saving', actions: assign({stateQueue: '#asyncClustering', parentState: 'fewShots'})},
                                        TRANSITION_TO_ASYNC_LABEL_PROPAGATION: {target: 'saving', actions: assign({stateQueue: '#asyncLabelPropagation', parentState: 'fewShots'})},
                                        RELOAD_PAGE_BUTTON_PRESS: {target: '#reloadPage', actions: assign({parentState: 'fewShots'})},
                                        EXPORT_PROJECT_BUTTON_PRESS: {target: 'saving', actions: assign({stateQueue: '#exportProject'})},
                                        USER_SAVE_BUTTON_PRESS: {target: 'saving', actions: assign({stateQueue: '#fewShotsInit', parentState: 'fewShots'})},
                                    },
                                    exit: ['deactivateDragDropChangingHandler'],
                                },
                                saving: {
                                    invoke: {
                                        src: (context, event) => saveBoxPromise(context.parentState), 
                                        onDone: [
                                            {target: '#fewShotsExecute', cond: (context, event) => context.stateQueue === "#fewShotsExecute"}, 
                                            {target: '#fewShotsInit', cond: (context, event) => context.stateQueue === "#fewShotsInit"},
                                            {target: '#asyncLineSegmentation', cond: (context, event) => context.stateQueue === "#asyncLineSegmentation"},
                                            {target: '#few_shot_train', cond: (context, event) => context.stateQueue === "#few_shot_train"},
                                            {target: '#asyncSegmentation', cond: (context, event) => context.stateQueue === "#asyncSegmentation"},
                                            {target: '#asyncClustering', cond: (context, event) => context.stateQueue === "#asyncClustering"},
                                            {target: '#asyncLabelPropagation', cond: (context, event) => context.stateQueue === "#asyncLabelPropagation"},
                                            {target: '#exportProject', cond: (context, event) => context.stateQueue === "#exportProject"},
                            // if no guard evaluates to true then go to error state, just to keep the state machine going, otherwise it would get stuck here
                                            {target: '#globalErrorState'} 
                                        ]
                                    } 
                                }
                            },
                            exit: ['clearContext']  
                        },
                        execute: {
                            id: 'fewShotsExecute',
                            invoke: {
                                src: executeBackendFewShotsPromise,
                                onDone: {target: 'init'}
                            },
                        }
                    }
                },
                few_shot_train: {
                    id: 'few_shot_train',
                    initial: 'init',
                    on: { ERROREVENT: '#globalErrorState' },
                    states: {
                        init: {
                            id: 'init_few_shot_train',
                            invoke: {
                                src: init_few_shot_train_promise,
                                onDone: 'ready'
                            }
                        },
                        ready: { 
                            entry: ['activateDragDropChangingHandler'],
                            initial: 'pending', 
                            states: {
                                pending: {
                                    on: {
                                        FEW_SHOT_TRAIN_BUTTON_PRESS: {target: 'saving', actions: assign({stateQueue: '#execute_backend_few_shot_train', parentState: 'few_shot_train'})}, 
                                        PAGECHANGEPRESS: {target: 'saving', actions: assign({stateQueue: '#init_few_shot_train', parentState: 'few_shot_train'})},
                                        TRANSITION_TO_ASYNC_SEGMENTATION: {target: 'saving', actions: assign({stateQueue: '#asyncSegmentation', parentState: 'few_shot_train'})},
                                        TRANSITION_TO_ASYNC_LINE_SEGMENTATION: {target: 'saving', actions: assign({stateQueue: '#asyncLineSegmentation', parentState: 'few_shot_train'})},
                                        TRANSITION_TO_FEW_SHOTS: {target: 'saving', actions: assign({stateQueue: '#fewShots', parentState: 'few_shot_train'})},
                                        TRANSITION_TO_ASYNC_CLUSTERING: {target: 'saving', actions: assign({stateQueue: '#asyncClustering', parentState: 'few_shot_train'})},
                                        TRANSITION_TO_ASYNC_LABEL_PROPAGATION: {target: 'saving', actions: assign({stateQueue: '#asyncLabelPropagation', parentState: 'few_shot_train'})},
                                        RELOAD_PAGE_BUTTON_PRESS: {target: '#reloadPage', actions: assign({parentState: 'few_shot_train'})},
                                        EXPORT_PROJECT_BUTTON_PRESS: {target: 'saving', actions: assign({stateQueue: '#exportProject'})},
                                        USER_SAVE_BUTTON_PRESS: {target: 'saving', actions: assign({stateQueue: '#init_few_shot_train', parentState: 'few_shot_train'})},
                                    },
                                    exit: ['deactivateDragDropChangingHandler'],
                                },
                                saving: {
                                    invoke: {
                                        src: (context, event) => saveBoxPromise(context.parentState), 
                                        onDone: [
                                            {target: '#execute_backend_few_shot_train', cond: (context, event) => context.stateQueue === "#execute_backend_few_shot_train"}, 
                                            {target: '#init_few_shot_train', cond: (context, event) => context.stateQueue === "#init_few_shot_train"},
                                            {target: '#asyncLineSegmentation', cond: (context, event) => context.stateQueue === "#asyncLineSegmentation"},
                                            {target: '#fewShots', cond: (context, event) => context.stateQueue === "#fewShots"},
                                            {target: '#asyncSegmentation', cond: (context, event) => context.stateQueue === "#asyncSegmentation"},
                                            {target: '#asyncClustering', cond: (context, event) => context.stateQueue === "#asyncClustering"},
                                            {target: '#asyncLabelPropagation', cond: (context, event) => context.stateQueue === "#asyncLabelPropagation"},
                                            {target: '#exportProject', cond: (context, event) => context.stateQueue === "#exportProject"},                                            
                            // if no guard evaluates to true then go to error state, just to keep the state machine going, otherwise it would get stuck here
                                            {target: '#globalErrorState'} 
                                        ]
                                    } 
                                }
                            },
                            exit: ['clearContext']  
                        },
                        execute: {
                            id: 'execute_backend_few_shot_train',
                            invoke: {
                                src: execute_backend_few_shot_train_promise,
                                onDone: {target: 'init'}
                            },
                        }
                    }
                },
                asyncSegmentation: {
                    id: 'asyncSegmentation',
                    initial: 'init',
                    on: { ERROREVENT: '#globalErrorState' },
                    states: {
                        init: {
                            id: 'asyncSegmentationInit',
                            invoke: {
                                src: initAsyncSegmentationPromise,
                                onDone: 'ready'
                            }
                        },
                        ready: { 
                            entry: ['activateDragDropChangingHandler'],
                            initial: 'pending', 
                            states: {
                                pending: {
                                    on: {
                                        ASYNC_SEGMENTATION_BUTTON_PRESS: {target: 'saving', actions: assign({stateQueue: '#asyncSegmentationExecute', parentState: 'asyncSegmentation'})}, 
                                        PAGECHANGEPRESS: {target: 'saving', actions: assign({stateQueue: '#asyncSegmentationInit', parentState: 'asyncSegmentation'})},
                                        TRANSITION_TO_ASYNC_LINE_SEGMENTATION: {target: 'saving', actions: assign({stateQueue: '#asyncLineSegmentation', parentState: 'asyncSegmentation'})},
                                        TRANSITION_TO_FEW_SHOTS: {target: 'saving', actions: assign({stateQueue: '#fewShots', parentState: 'asyncSegmentation'})},
                                        TRANSITION_TO_FEW_SHOT_TRAIN: {target: 'saving', actions: assign({stateQueue: '#few_shot_train', parentState: 'asyncSegmentation'})},
                                        TRANSITION_TO_ASYNC_CLUSTERING: {target: 'saving', actions: assign({stateQueue: '#asyncClustering', parentState: 'asyncSegmentation'})},
                                        TRANSITION_TO_ASYNC_LABEL_PROPAGATION: {target: 'saving', actions: assign({stateQueue: '#asyncLabelPropagation', parentState: 'asyncSegmentation'})},
                                        RELOAD_PAGE_BUTTON_PRESS: {target: '#reloadPage', actions: assign({parentState: 'asyncSegmentation'})},
                                        EXPORT_PROJECT_BUTTON_PRESS: {target: 'saving', actions: assign({stateQueue: '#exportProject'})},
                                        USER_SAVE_BUTTON_PRESS: {target: 'saving', actions: assign({stateQueue: '#asyncSegmentationInit', parentState: 'asyncSegmentation'})},
                                    },
                                    exit: ['deactivateDragDropChangingHandler'],
                                },
                                saving: {
                                    invoke: {
                                        src: (context, event) => saveBoxPromise(context.parentState), 
                                        onDone: [
                                            {target: '#asyncSegmentationExecute', cond: (context, event) => context.stateQueue === "#asyncSegmentationExecute"}, 
                                            {target: '#asyncSegmentationInit', cond: (context, event) => context.stateQueue === "#asyncSegmentationInit"},
                                            {target: '#asyncLineSegmentation', cond: (context, event) => context.stateQueue === "#asyncLineSegmentation"},
                                            {target: '#fewShots', cond: (context, event) => context.stateQueue === "#fewShots"},
                                            {target: '#few_shot_train', cond: (context, event) => context.stateQueue === "#few_shot_train"},
                                            {target: '#asyncClustering', cond: (context, event) => context.stateQueue === "#asyncClustering"},
                                            {target: '#asyncLabelPropagation', cond: (context, event) => context.stateQueue === "#asyncLabelPropagation"},
                                            {target: '#exportProject', cond: (context, event) => context.stateQueue === "#exportProject"},
                            // if no guard evaluates to true then go to error state, just to keep the state machine going, otherwise it would get stuck here
                                            {target: '#globalErrorState'} 
                                        ]
                                    } 
                                }
                            },
                            exit: ['clearContext']  
                        },
                        execute: {
                            id: 'asyncSegmentationExecute',
                            invoke: {
                                src: executeBackendAsyncSegmentationPromise,
                                onDone: {target: 'init'}
                            },
                        }
                    }
                },
                asyncClustering: {
                    id: 'asyncClustering',
                    initial: 'init',
                    on: { ERROREVENT: '#globalErrorState' },
                    states: {
                        init: {
                            id: 'asyncClusteringInit',
                            invoke: {
                                src: initAsyncClusteringPromise,
                                onDone: 'ready'
                            }
                        },
                        ready: { 
                            entry: ['activateDragDropChangingHandler'],
                            initial: 'pending', 
                            states: {
                                pending: {
                                    on: {
                                        ASYNC_CLUSTERING_BUTTON_PRESS: {target: 'saving', actions: assign({stateQueue: '#asyncClusteringExecute', parentState: 'asyncClustering'})}, 
                                        PAGECHANGEPRESS: {target: 'saving', actions: assign({stateQueue: '#asyncClusteringInit', parentState: 'asyncClustering'})},
                                        TRANSITION_TO_ASYNC_LINE_SEGMENTATION: {target: 'saving', actions: assign({stateQueue: '#asyncLineSegmentation', parentState: 'asyncClustering'})},
                                        TRANSITION_TO_FEW_SHOTS: {target: 'saving', actions: assign({stateQueue: '#fewShots', parentState: 'asyncClustering'})},
                                        TRANSITION_TO_FEW_SHOT_TRAIN: {target: 'saving', actions: assign({stateQueue: '#few_shot_train', parentState: 'asyncClustering'})},
                                        TRANSITION_TO_ASYNC_SEGMENTATION: {target: 'saving', actions: assign({stateQueue: '#asyncSegmentation', parentState: 'asyncClustering'})},
                                        TRANSITION_TO_ASYNC_LABEL_PROPAGATION: {target: 'saving', actions: assign({stateQueue: '#asyncLabelPropagation', parentState: 'asyncClustering'})},
                                        RELOAD_PAGE_BUTTON_PRESS: {target: '#reloadPage', actions: assign({parentState: 'asyncClustering'})},
                                        EXPORT_PROJECT_BUTTON_PRESS: {target: 'saving', actions: assign({stateQueue: '#exportProject'})},
                                        USER_SAVE_BUTTON_PRESS: {target: 'saving', actions: assign({stateQueue: '#asyncClusteringInit', parentState: 'asyncClustering'})},
                                    },
                                    exit: ['deactivateDragDropChangingHandler'],
                                },
                                saving: {
                                    invoke: {
                                        src: (context, event) => saveBoxPromise(context.parentState), 
                                        onDone: [
                                            {target: '#asyncClusteringExecute', cond: (context, event) => context.stateQueue === "#asyncClusteringExecute"}, 
                                            {target: '#asyncClusteringInit', cond: (context, event) => context.stateQueue === "#asyncClusteringInit"},
                                            {target: '#asyncLineSegmentation', cond: (context, event) => context.stateQueue === "#asyncLineSegmentation"},
                                            {target: '#fewShots', cond: (context, event) => context.stateQueue === "#fewShots"},
                                            {target: '#few_shot_train', cond: (context, event) => context.stateQueue === "#few_shot_train"},
                                            {target: '#asyncSegmentation', cond: (context, event) => context.stateQueue === "#asyncSegmentation"},
                                            {target: '#asyncLabelPropagation', cond: (context, event) => context.stateQueue === "#asyncLabelPropagation"},
                                            {target: '#exportProject', cond: (context, event) => context.stateQueue === "#exportProject"},
                            // if no guard evaluates to true then go to error state, just to keep the state machine going, otherwise it would get stuck here
                                            {target: '#globalErrorState'} 
                                        ]
                                    } 
                                }
                            },
                            exit: ['clearContext']  
                        },
                        execute: {
                            id: 'asyncClusteringExecute',
                            invoke: {
                                src: executeBackendAsyncClusteringPromise,
                                onDone: {target: 'init'}
                            },
                        }
                    }
                },
                asyncLabelPropagation: {
                    id: 'asyncLabelPropagation',
                    initial: 'init',
                    on: { ERROREVENT: '#globalErrorState' },
                    states: {
                        init: {
                            id: 'asyncLabelPropagationInit',
                            invoke: {
                                src: initAsyncLabelPropagationPromise,
                                onDone: 'ready'
                            }
                        },
                        ready: { 
                            entry: ['activateDragDropChangingHandler'],
                            initial: 'pending', 
                            states: {
                                pending: {
                                    on: {
                                        ASYNC_LABEL_PROPAGATION_BUTTON_PRESS: {target: 'saving', actions: assign({stateQueue: '#asyncLabelPropagationExecute', parentState: 'asyncLabelPropagation'})}, 
                                        PAGECHANGEPRESS: {target: 'saving', actions: assign({stateQueue: '#asyncLabelPropagationInit', parentState: 'asyncLabelPropagation'})},
                                        TRANSITION_TO_ASYNC_LINE_SEGMENTATION: {target: 'saving', actions: assign({stateQueue: '#asyncLineSegmentation', parentState: 'asyncLabelPropagation'})},
                                        TRANSITION_TO_FEW_SHOTS: {target: 'saving', actions: assign({stateQueue: '#fewShots', parentState: 'asyncLabelPropagation'})},
                                        TRANSITION_TO_FEW_SHOT_TRAIN: {target: 'saving', actions: assign({stateQueue: '#few_shot_train', parentState: 'asyncLabelPropagation'})},
                                        TRANSITION_TO_ASYNC_SEGMENTATION: {target: 'saving', actions: assign({stateQueue: '#asyncSegmentation', parentState: 'asyncLabelPropagation'})},
                                        TRANSITION_TO_ASYNC_CLUSTERING: {target: 'saving', actions: assign({stateQueue: '#asyncClustering', parentState: 'asyncLabelPropagation'})},
                                        RELOAD_PAGE_BUTTON_PRESS: {target: '#reloadPage', actions: assign({parentState: 'asyncLabelPropagation'})},
                                        EXPORT_PROJECT_BUTTON_PRESS: {target: 'saving', actions: assign({stateQueue: '#exportProject'})},
                                        USER_SAVE_BUTTON_PRESS: {target: 'saving', actions: assign({stateQueue: '#asyncLabelPropagationInit', parentState: 'asyncLabelPropagation'})},
                                    },
                                    exit: ['deactivateDragDropChangingHandler'],
                                },
                                saving: {
                                    invoke: {
                                        src: (context, event) => saveBoxPromise(context.parentState), 
                                        onDone: [
                                            {target: '#asyncLabelPropagationExecute', cond: (context, event) => context.stateQueue === "#asyncLabelPropagationExecute"}, 
                                            {target: '#asyncLabelPropagationInit', cond: (context, event) => context.stateQueue === "#asyncLabelPropagationInit"},
                                            {target: '#asyncLineSegmentation', cond: (context, event) => context.stateQueue === "#asyncLineSegmentation"},
                                            {target: '#fewShots', cond: (context, event) => context.stateQueue === "#fewShots"},
                                            {target: '#few_shot_train', cond: (context, event) => context.stateQueue === "#few_shot_train"},
                                            {target: '#asyncSegmentation', cond: (context, event) => context.stateQueue === "#asyncSegmentation"},
                                            {target: '#asyncClustering', cond: (context, event) => context.stateQueue === "#asyncClustering"},
                                            {target: '#exportProject', cond: (context, event) => context.stateQueue === "#exportProject"},
                            // if no guard evaluates to true then go to error state, just to keep the state machine going, otherwise it would get stuck here
                                            {target: '#globalErrorState'} 
                                        ]
                                    } 
                                }
                            },
                            exit: ['clearContext']  
                        },
                        execute: {
                            id: 'asyncLabelPropagationExecute',
                            invoke: {
                                src: executeBackendAsyncLabelPropagationPromise,
                                onDone: {target: 'init'}
                            },
                        }
                    }
                },
            }
        },
        reloadPage: {
            id: 'reloadPage',
            invoke: {
                src: (context, event) =>  reloadPagePromise(context.parentState),
                onDone: 'active.hist'
            }
        },
        exportProject: {
            id: 'exportProject',
            invoke: {
                src: (context, event) =>  exportProjectPromiseWrapper(),
                onDone: 'active.hist'
            }
        },
        globalErrorState: {id: 'globalErrorState', on: { ERRORBUTTONPRESS: 'active.hist' }, exit: ['exitErrorWidget'] },
        }
    },
    {
    actions: {
        exitErrorWidget: (context, event) => {
            console.log("exitErrorWidget", context, event);
            functionExitErrorWidget();
        },
        activateDragDropChangingHandler: () => {
            console.log("activateDragDropChangingHandler");
            functionActivateDragDropChangingHandler(); // attach event handlers
        },
        deactivateDragDropChangingHandler: () => {
            console.log("deactivateDragDropChangingHandler");
            
            // remove event handlers so that during state transitions users would not be able to trigger those events
            document.removeEventListener('click', handleClickEvents);
            document.removeEventListener('mousedown', handleMouseDownEvents);
            document.removeEventListener('keydown', handleKeyDownEvents);
            document.removeEventListener('keyup', imageProcPageHandleKeyUpEvents);
        },
        clearContext: assign((context, event) => ({ // clears out the state machine context
            stateQueue: "",
            parentState: "" 
        })),
    }
});

$("document").ready(function(){

/* Start statemachine when page is loaded */
    const webPageService = interpret(webPageMachine);
    webPageService.start();

    // detailed logging of state transitions
    const recursive_obj_key_print = (input_obj, result = []) => {

        let new_keys = Object.keys(input_obj);

        new_keys.forEach(key => {
            const next_obj = input_obj[key];
            if(typeof next_obj === 'object'){
                result.push(key)
                recursive_obj_key_print(next_obj, result);
            }
            else{
                result.push(next_obj)
                let log_string = "";
                result.forEach(e => log_string += ` => ${e}`);
                console.log("---- New state %s ----", log_string);
            }
        });
    };

// Log new state on change
// only relevant for development, should be removed in production
    webPageService.onTransition(state => {
        if(state.changed){
            recursive_obj_key_print(state.value);
        }
    });

// Here we bind the state machine to click events. In other words, on certain click events
// the state machine will receive a signal to transition to another state.
// See for example the "ASYNC_LINE_SEGMENTATION_BUTTON_PRESS" signal in the "asyncLineSegmentation" state.

    // user clicks to execute the line segmentation: state machine receives signal to transition accordingly
    $("#executeAsyncLineSegmentationButton").click( () => {
        console.log("start transition ASYNC_LINE_SEGMENTATION_BUTTON_PRESS");
        webPageService.send('ASYNC_LINE_SEGMENTATION_BUTTON_PRESS');        

    });

    // user clicks to execute the Few-shot prediction: state machine receives signal to transition accordingly
    $("#executeFewShotsButton").click( () => {
        console.log("start transition FEW_SHOTS_BUTTON_PRESS");
        webPageService.send('FEW_SHOTS_BUTTON_PRESS');        

    });

    // user clicks to execute the Few-shot fine-tuning: state machine receives signal to transition accordingly
    $("#execute_few_shot_train_button").click( () => {
        console.log("start transition FEW_SHOT_TRAIN_BUTTON_PRESS");
        webPageService.send('FEW_SHOT_TRAIN_BUTTON_PRESS');        

    });
    

    // user clicks to execute the segmentation: state machine receives signal to transition accordingly
    $("#executeAsyncSegmentationButton").click( () => {
        console.log("start transition ASYNC_SEGMENTATION_BUTTON_PRESS");
        webPageService.send('ASYNC_SEGMENTATION_BUTTON_PRESS');        

    });

    // user clicks to execute the clustering: state machine receives signal to transition accordingly
    $("#executeAsyncClusteringButton").click( () => {
        console.log("start transition ASYNC_CLUSTERING_BUTTON_PRESS");
        webPageService.send('ASYNC_CLUSTERING_BUTTON_PRESS');        

    });

    // user clicks to execute the label propagation: state machine receives signal to transition accordingly
    $("#executeAsyncLabelPropagationButton").click( () => {
        console.log("start transition ASYNC_LABEL_PROPAGATION_BUTTON_PRESS");
        webPageService.send('ASYNC_LABEL_PROPAGATION_BUTTON_PRESS');        
    
    });

    // user clicks to save the page: state machine receives signal to transition accordingly
    $(document).on("click", "#saveButton", function(){
        console.log("start transition USER_SAVE_BUTTON_PRESS");
        webPageService.send('USER_SAVE_BUTTON_PRESS');     

    });

    // user clicks to reload the page: state machine receives signal to transition accordingly
    $("#reloadButton").click( () => {
        console.log("start transition RELOAD_PAGE_BUTTON_PRESS");
        webPageService.send('RELOAD_PAGE_BUTTON_PRESS');        

    });

    // user clicks to export out the project: state machine receives signal to transition accordingly
    $("#exportButton").click( () => {
        console.log("start transition EXPORT_PROJECT_BUTTON_PRESS");
        webPageService.send('EXPORT_PROJECT_BUTTON_PRESS');        

    });

    // user clicks to change to the "asyncLineSegmentation" state: state machine receives signal to transition accordingly
    $(document).on("click", "#asyncLineSegmentationDropdownState", function(){ 

        $(this).siblings('.activeBlock').removeClass("activeBlock");
        $(this).addClass("activeBlock");

        console.log("start transition TRANSITION_TO_ASYNC_LINE_SEGMENTATION");
        webPageService.send('TRANSITION_TO_ASYNC_LINE_SEGMENTATION');
                
    }); 

    // user clicks to change to the "fewShots" state: state machine receives signal to transition accordingly
    $(document).on("click", "#fewShotsDropdownState", function(){ 

        $(this).siblings('.activeBlock').removeClass("activeBlock");
        $(this).addClass("activeBlock");

        console.log("start transition TRANSITION_TO_FEW_SHOTS");
        webPageService.send('TRANSITION_TO_FEW_SHOTS');
                
    }); 


    // user clicks to change to the "few_shot_train" state: state machine receives signal to transition accordingly
    $(document).on("click", "#few_shot_train_dropdown_state", function(){ 

        $(this).siblings('.activeBlock').removeClass("activeBlock");
        $(this).addClass("activeBlock");
        
        console.log("start transition TRANSITION_TO_FEW_SHOT_TRAIN");
        webPageService.send('TRANSITION_TO_FEW_SHOT_TRAIN');
                
    }); 

    // user clicks to change to the "asyncSegmentation" state: state machine receives signal to transition accordingly
    $(document).on("click", "#asyncSegmentationDropdownState", function(){ 

        $(this).siblings('.activeBlock').removeClass("activeBlock");
        $(this).addClass("activeBlock");

        console.log("start transition TRANSITION_TO_ASYNC_SEGMENTATION");
        webPageService.send('TRANSITION_TO_ASYNC_SEGMENTATION');
                
    }); 

    // user clicks to change to the "asyncClustering" state: state machine receives signal to transition accordingly
    $(document).on("click", "#asyncClusteringDropdownState", function(){ 

        $(this).siblings('.activeBlock').removeClass("activeBlock");
        $(this).addClass("activeBlock");

        console.log("start transition TRANSITION_TO_ASYNC_CLUSTERING");
        webPageService.send('TRANSITION_TO_ASYNC_CLUSTERING');
                
    }); 

    // user clicks to change to the "asyncLabelPropagation" state: state machine receives signal to transition accordingly
    $(document).on("click", "#asyncLabelPropagationDropdownState", function(){ 

        $(this).siblings('.activeBlock').removeClass("activeBlock");
        $(this).addClass("activeBlock");

        console.log("start transition TRANSITION_TO_ASYNC_LABEL_PROPAGATION");
        webPageService.send('TRANSITION_TO_ASYNC_LABEL_PROPAGATION');
                
    });  

    // On error widget button click, which means closing the widget, we send a signal to the state machine
    // to transition back to the last active state.
    $(".errorButton").click(() => {
        console.log("start transition ERRORBUTTONPRESS");
        functionExitErrorWidget();
        webPageService.send('ERRORBUTTONPRESS');
    });

    // User clicks to toggle in/out the left menu.
    // State machine does not receive a signal here, this is handled outside of the state machine.
    document.addEventListener("click", function(event) {

        const leftMenu = document.querySelector("#leftMenu");

        //toggling out the left menu by clicking on the leftMenu element
        if(event.target.id === "leftMenuButton"){
            leftMenu.classList.add("activeLeftMenu");
        } //toggle back the left menu by clicking anywhere on the page except the left menu area
        else if(leftMenu.classList.contains("activeLeftMenu") &&
        event.target !== leftMenu && event.target.parentNode !== leftMenu){
            document.querySelector("#leftMenu").classList.remove("activeLeftMenu"); 
        }
    });

});