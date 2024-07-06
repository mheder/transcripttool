/************************************************************************************************************
 * Handles the post-processing view page. This is the "last" page, where the user can manually edit
 * the boxes (symbols) and clusters (alphabet) that were generated in the "image processing view" page.
 * Additionally, the user can also reload the page and export out the project as a zip file.
 * This page is driven by a state machine, which handles the logic of the page. See more details on
 * this in the code below.
 * 
************************************************************************************************************/

"use strict";

import {
    undefinedClusterColorHex
} from '../utils_js/generic_utils.js';

import {
    save_boxes_to_server, placeBoxesOnImage,
} from '../utils_js/state_utils.js';

import {
    queryImageProperties, initAllImages
} from '../utils_js/image_utils.js';

import {
    handleKeyDownEvents, handleKeyUpEvents, handleAddingBoxEvent,
} from '../utils_js/event_utils.js';

import {
    rainbow, hexToRgb, shuffleArray, AssociateColorsWithClusters
} from '../utils_js/cluster_color_utils.js';

import {
    PROJECT_VIEW_URL, PRE_PROCESSING_VIEW_URL, IMAGE_PROCESSING_VIEW_URL, POST_PROCESSING_VIEW_URL, DOMAIN
} from '../config/config.js';

/*---------------------------------------------------------GLOBAL VARIABLES----------------------------------------------------------------------------*/
const project_id = send_to_frontend["project_id"]; // identifies the project
const save_id = send_to_frontend["save_id"]; // identifies the save
var lookup_table = send_to_frontend["lookup_table"]; // lookup table of the save

var bounding_boxes, transcription_json; // objects storing the save's bounding boxes and transcription data
var initialImageSizes = {}; // width and height of the images
var imagePropertiesObject = {}; // object storing the properties of the images

const LOAD_JSON_PHP_PATH = send_to_frontend["LOAD_JSON_PHP_PATH"];
const SAVE_JSON_PHP_PATH = send_to_frontend["SAVE_JSON_PHP_PATH"];
const FETCH_TRANSCRIPTION_PHP_PATH = send_to_frontend["FETCH_TRANSCRIPTION_PHP_PATH"];
const SAVE_TRANSCRIPTION_PHP_PATH = send_to_frontend["SAVE_TRANSCRIPTION_PHP_PATH"];

/*---------------------------------------------------------HELPER FUNCTIONS----------------------------------------------------------------------------*/

/**
 * Initializes the transcription list which display the clusters (or alphabet) and their transcriptions and colors.
 * This list appears on the left side of the page.
 * 
 * @param {Object} bounding_boxes - The object containing the bounding boxes.
 * @param {Object} transcription_json - The object containing the transcriptions and their colors.
 * @returns {Promise} A promise that resolves with the updated transcription JSON.
 */
const initTranscriptionList = (bounding_boxes, transcription_json) => {
    return new Promise((resolve, reject) => {
        console.log("initTranscriptionList starts");

        let local_transcription_json = null;

        //First, just to make sure, remove list elements from the DOM
        document.querySelectorAll("#trMenu > li").forEach(e => e.remove());

        AssociateColorsWithClusters(project_id, save_id, bounding_boxes, transcription_json, SAVE_JSON_PHP_PATH).then(response => { //save_json.php

            local_transcription_json = response;

            const alphabetically_sorted_array = Object.entries(local_transcription_json["transcriptions"]).sort(function(a, b) {
                return a[1]["transcription"].localeCompare(b[1]["transcription"]); // Object.entries(...) returns key/value pairs hence the indexing
            });

            alphabetically_sorted_array.forEach(value => {

                const key = value[0];
                const transcription_json_value = value[1];

                createTranscriptionListElement(key, transcription_json_value["color"], transcription_json_value["transcription"]);

            });

            // Put the undefined cluster menu element on top of the menu. When required the SPACE cluster menu element can be moved there as well.
            const undefined_cluster_menu_element = document.querySelector("#cluster_-2");
            document.querySelector("#cluster_-2").parentElement.removeChild(undefined_cluster_menu_element);
            document.querySelector("#trMenu").prepend(undefined_cluster_menu_element);

            console.log("initTranscriptionList done");
            resolve(local_transcription_json);

        });

    });    
};

/**
 * Create a new element in the transcription list (#trMenu) for a cluster.
 * @param {String} cluster_id - id number of the cluster (starting from 0, 1, 2, ...).
 * @param {String} hexColor - color associated with the cluster encoded in hex.
 * @param {String} transcription - transcription associated with the cluster.
 */
const createTranscriptionListElement = (cluster_id, hexColor, transcription) => {

    //First, create the list element
    let listElement = document.createElement('li');
    listElement.className = "trListElements";
    listElement.id = `cluster_${cluster_id}`;
    listElement.dataset.cluster_id = cluster_id;
    listElement.dataset.transcription = transcription;
    listElement.dataset.color = hexColor;
    const rgbColor = hexToRgb(hexColor);
    const rgbaColor = `rgba(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b}, 0.4)`;
    listElement.style.background = rgbaColor;

    //Second, create the text input element
    let inputElement = document.createElement('input');
    inputElement.className = "trListTranscription";
    inputElement.type = 'text';
    inputElement.value = transcription;


    if(cluster_id === "-2"){
        inputElement.placeholder = "?";
        inputElement.disabled = true;
    }
    else if(cluster_id === "-1"){
        inputElement.placeholder = "SPACE";
        inputElement.disabled = true;
    }
    else{
        inputElement.placeholder = "write here";
        inputElement.disabled = false;

        if (inputElement.value !== "") {
            inputElement.classList.add("transcriptionDone");
        }
    }
    
    listElement.appendChild(inputElement);

    //Finally, create the checkbox element
    let checkBox = document.createElement('input');
    checkBox.className = "trListCheckbox";
    checkBox.type = 'checkbox';
    listElement.appendChild(checkBox);

    document.querySelector("#trMenu").appendChild(listElement);

};

/**
 * Redraws the canvas of a single box based on its current size and position.
 * These canvases are used to display the graphic clusters (right side of the page).
 * @param {HTMLElement} currentBox - The box element to redraw the canvas for.
 * @param {number} resizerConst - Constant controlling the size of the canvas.
 */
const redrawCanvasOfSingleBox = (currentBox, resizerConst) => {

    if(document.querySelector("#canvas_"+currentBox.id) === null){
        let newCanvas = document.createElement('canvas');
        newCanvas.id = `canvas_${currentBox.id}`;
        newCanvas.className = "canvasElement selectableCanvasElement";
        document.querySelector(".canvasWrapper").appendChild(newCanvas);
    }

    const coordsCurrentBox = {
        "left": currentBox.getBoundingClientRect().left,
        "top": currentBox.getBoundingClientRect().top,
        "width": currentBox.getBoundingClientRect().width,
        "height": currentBox.getBoundingClientRect().height
    };

    const imgId = imagePropertiesObject[currentBox.dataset.parent_image]["id"];
    const imgSelect = document.querySelector(`#${imgId}`);

    const canvasSelected = document.querySelector("#canvas_"+currentBox.id);
    const contextCanvas = canvasSelected.getContext("2d");
    const imageProperties = imagePropertiesObject[currentBox.dataset.parent_image];
    
    const w_width = coordsCurrentBox.width / (imageProperties.width);
    const w_height = coordsCurrentBox.height / (imageProperties.height);
    const w_top = (coordsCurrentBox.top - imageProperties.positionTop + parseInt(document.documentElement.scrollTop)) / imageProperties.height;
    const w_left = (coordsCurrentBox.left - imageProperties.positionLeft) / imageProperties.width;

    const coords = {
        "x_start_clipping": w_left * imageProperties.naturalWidth,
        "y_start_clipping": w_top  * imageProperties.naturalHeight,
        "width_of_clipped": w_width * imageProperties.naturalWidth,
        "height_of_clipped": w_height * imageProperties.naturalHeight,
        "x_on_canvas": 0,
        "y_on_canvas": 0,
        "width_of_img_on_canvas": 270, // fixed sizes seem to work well here
        "height_of_img_on_canvas": 120 // fixed sizes seem to work well here
    };

    $("#canvas_"+currentBox.id).height(resizerConst* w_height * imageProperties.height);
    $("#canvas_"+currentBox.id).width(resizerConst* w_width * imageProperties.width);
    
    contextCanvas.drawImage(imgSelect, coords.x_start_clipping,
        coords.y_start_clipping, coords.width_of_clipped, coords.height_of_clipped, 
        coords.x_on_canvas, coords.y_on_canvas,
        coords.width_of_img_on_canvas, coords.height_of_img_on_canvas
    );

};

/**
 * Prepares the transcription text file based on the boxes and clusters currently on the page
 * and then together with the Few-shot generated transcription text file (if available), images,
 * bounding boxes and transcription data exports them out as a zip file to the user.
 * Please note that this function is very similar to "exportProjectPromise" in "state_utils.js" (from
 *  the user's perspective: both are called through the same UI elements).
 * 
 * @param {Object} bounding_boxes - The object containing the bounding boxes.
 * @param {Object} transcription_json - The object containing the transcriptions and their colors.
 * @returns {Promise} - A promise that resolves when the transcription is sent successfully.
 */
function sendTranscriptionToClient(bounding_boxes, transcription_json){
    

    let transcriptionObject = {};

    // prepare the transcription based on the bounding boxes and clusters currently on the page
    Object.keys(bounding_boxes["documents"]).forEach(key => {
        const symbols_on_page = bounding_boxes["documents"][key];

        let transcriptionString = "";

        if(symbols_on_page.length !== 0){
            let averageHeight = 0;

            symbols_on_page.forEach(function(item, index) {

                averageHeight += item.height
                
            });

            averageHeight = averageHeight / symbols_on_page.length;

            console.log(averageHeight);
            
            let symbolsInLines = [[]];
            let symbolsInLinesIndex = 0;

            symbols_on_page.sort((a, b) => parseFloat(a.top + a.height / 2) - parseFloat(b.top + b.height / 2)); 

            let previousSymbol = symbols_on_page[0].top + symbols_on_page[0].height / 2;

            symbols_on_page.forEach(function(item, index) {

                if(Math.abs(previousSymbol - (item.top + item.height / 2)) > averageHeight * 0.5){
                    symbolsInLines.push([]);
                    symbolsInLinesIndex++;
                }

                symbolsInLines[symbolsInLinesIndex].push(item);

                previousSymbol = item.top + item.height / 2;

                
            });

            console.log(symbolsInLines);

            symbolsInLines.forEach(function(item, index) {

                item.sort((a, b) => parseFloat(a.left + a.width / 2) - parseFloat(b.left + b.width / 2));

                item.forEach(function(subItem, subIndex) {

                    let enteredTr = "";
                    
                    if(transcription_json["transcriptions"].hasOwnProperty(subItem["cluster_id"])){
                        
                        enteredTr = transcription_json["transcriptions"][subItem["cluster_id"]]["transcription"];
                    }
                    else{
                        enteredTr = "?"; // for an undefined symbol
                    }

                    transcriptionString += enteredTr + " ";
                });
                transcriptionString += "\n";

            });
        }

        transcriptionObject[key] = transcriptionString;

    });

    const sendJson = {
        "save_id": save_id,
        "project_id": project_id,
        "trObject": transcriptionObject
    };

    return fetch(SAVE_TRANSCRIPTION_PHP_PATH, {
        method: 'POST', 
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(sendJson)
    }).then(response => {
        return response.json()
    }).then(data => {

        const payloadToServer = {
            "save_id": save_id,
            "project_id": project_id
        };

        return fetch(FETCH_TRANSCRIPTION_PHP_PATH, {
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payloadToServer)
        });
        
    }).then(response => {
        return response.json()
    }).then(data => {

        console.log(data);

        let zip = new JSZip();

        let purged_transcription_json = {
            "transcriptions": {}
        };
        
        Object.keys(transcription_json["transcriptions"]).forEach((key, i) => {
            purged_transcription_json["transcriptions"][key] = {
                "transcription": transcription_json["transcriptions"][key]["transcription"]
            };
        });

        let purged_bounding_boxes = {
            "documents": bounding_boxes["documents"],
            "lines": bounding_boxes.hasOwnProperty("lines") ? bounding_boxes["lines"] : {},
            "image_name_mapping": lookup_table["image_name_mapping"] // add an entry containing the image name mapping
        };

        zip.file("bounding_boxes.json", JSON.stringify(purged_bounding_boxes));
        zip.file("transcription.json", JSON.stringify(purged_transcription_json));
        
        
        // this transcription was generated by the Few-shot method in the "image_processing" view page
        // this may or may not be available here
        if(Object.keys(data["generated_transcription"]).length !== 0){
            const transcriptionObject = data["generated_transcription"];
            Object.entries(transcriptionObject).forEach(([key, value], i) => {

                let transcription_string;

                if (typeof value === 'object' && value.hasOwnProperty('page_transcription')) {
                    transcription_string = value["page_transcription"];
                }
                else{
                    transcription_string = value;
                }

                const user_given_img_name = lookup_table["image_name_mapping"][key];
                zip.file(`${user_given_img_name.slice(0, user_given_img_name.lastIndexOf('.'))}.txt`, transcription_string); // _few_shot_transcription

            }); 
        }

        // this transcription was generated by here in this function
        if(Object.keys(data["post_processed_transcription"]).length !== 0){
            const transcriptionObject = data["post_processed_transcription"];

            Object.entries(transcriptionObject).forEach(([key, value], i) => {

                const user_given_img_name = lookup_table["image_name_mapping"][key];
                zip.file(`${user_given_img_name.slice(0, user_given_img_name.lastIndexOf('.'))}_post_processed_transcription.txt`, value);

            }); 

        }
        
        const bounding_boxes_keys = Object.keys(bounding_boxes["documents"]);
        let iter = 0;

        const  recursiveImageLoad =  (iter) => {
            return new Promise((resolve, reject) => { 
                if(iter === bounding_boxes_keys.length){
                    console.log("zip ready");
                    return resolve(zip);
                }
                const key = bounding_boxes_keys[iter];
                console.log(key);
                const imageURL = `${DOMAIN}/user_projects/${project_id}/${save_id}/${key}`;
                DOMAIN
                fetch(imageURL).then(response => response.blob()).then(imageBlob => { // ? add catch here?
                    const user_given_img_name = lookup_table["image_name_mapping"][key];
                    const imgData = new File([imageBlob], user_given_img_name);
                    zip.file(user_given_img_name, imgData, { base64: true });
                    iter += 1;
                    console.log("after loaded ", iter);
                    resolve(recursiveImageLoad(iter));
                });
            });
        };
        
        return recursiveImageLoad(iter);
    }).then(zipped_data => {
        console.log("zip arrived");
        zipped_data.generateAsync({type: "blob"}).then(function(content) {
            // please note that we use the user given save name here, hence we do not have complete control over the file name
            saveAs(content, `${lookup_table["user_given_save_name"]}.zip`); 
        }).catch(error => {
            console.log(error) 
            functionInitErrorWidget("");
        });
    }).catch(error => {
        console.log(error) 
        functionInitErrorWidget("");
    });       
};

/**
 * Shows all boxes and removes selected clusters (from alphabet, left menu).
 * Basically, it resets the visibility of boxes and clusters to the initial state.
 */
const showAllBoxes = () => {
    $('.selectedCluster').removeClass("selectedCluster");

    $('.activeListElement').removeClass("activeListElement");

    $('div.boxes').removeClass("hideElement");    

    //remove all canvases
    $("canvas").remove();
    $(".canvasWrapper").hide().show(0); //force DOM redraw to get rid of "residue" canvases (a bit hacky)
};

/*----------------------------------------------------STATE TRANSITION FUNCTIONS-----------------------------------------------------------------------*/

/**
 * Initializes the page by setting up the necessary elements and fetching data from the server.
 * @returns {Promise} A promise that resolves when the page initialization is complete.
 */
const initPagePromise = () => {

    console.log("initPagePromise starts");

    document.querySelector("#redirectMainPage").href = `${PROJECT_VIEW_URL}?project_id=${project_id}`;
    document.querySelector("#redirectImageProcPage").href = `${IMAGE_PROCESSING_VIEW_URL}?project_id=${project_id}&save_id=${save_id}`;
    document.querySelector("#redirectPreProcPage").href = `${PRE_PROCESSING_VIEW_URL}?project_id=${project_id}&save_id=${save_id}`;
    document.querySelector("#pageTitle").textContent = `Project: ${lookup_table["user_given_project_name"]} - ${lookup_table["user_given_save_name"]}`;

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
        
        console.log("bounding_boxes= ", bounding_boxes);
        console.log("transcription_json= ", transcription_json);

        return initAllImages(project_id, save_id, DOMAIN, lookup_table["image_name_mapping"]); 
    }).then(() => {
        return new Promise((resolve, reject) => { 
            setTimeout(function(){
                resolve();
            }, 700); //wait 700 ms, as images are sometimes not loaded correctly in time, and so the image height becomes zero
        });
        
    }).then(() => {

        const list_of_images = document.querySelectorAll(".b_image");

        // note: this will only work for the graphic clusters if we never modify the image sizes 
        list_of_images.forEach((element) => {
            
            initialImageSizes[element.id] = {};
            initialImageSizes[element.id]["width"] =  element.width;
            initialImageSizes[element.id]["height"] =  element.height;
            element.classList.remove("invisibleElement");
        });

        console.log(initialImageSizes);

        for (let index = 0; index < list_of_images.length; index++) {
            const quiredProps = queryImageProperties(`#${list_of_images[index].id}`);
            imagePropertiesObject[quiredProps["imageFullName"]] = quiredProps;
            
        }

        return initTranscriptionList(bounding_boxes, transcription_json);
        
    }).then((new_transcription_json) => {

        transcription_json = new_transcription_json;
        
        console.log("initPagePromise done");
        
    }).catch(error => {
        console.log(error);
        functionInitErrorWidget("");
    });   
};

/**
 * Initializes the transcription state by placing the boxes on the image.
 * @returns {Promise} A promise that resolves with the transcription JSON data.
 */
const initTranscriptionPromise = () => {

    console.log("initTranscriptionPromise starts");

    showAllBoxes();

    return placeBoxesOnImage(project_id, save_id, imagePropertiesObject, "transcription", LOAD_JSON_PHP_PATH, SAVE_JSON_PHP_PATH).then((data) => {

        transcription_json = data;
        $("#loadingStateWrapper").addClass("hideElement");
        $(".trMenuWrapper").removeClass("hideElement");
        
        console.log("initTranscriptionPromise done");

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
const executeBackendExportPromise = () => {

    console.log("executeBackendExportPromise starts");

    console.log(bounding_boxes, transcription_json);

    return sendTranscriptionToClient(bounding_boxes, transcription_json).then(() => {
        
        console.log("executeBackendExportPromise done");

    }).catch(error => {
        console.log(error) 
        functionInitErrorWidget("");
    });
};


/**
 * Saves the boxes to the server and updates the bounding boxes and transcription JSON files.
 * @returns {Promise} A promise that resolves when the saving is complete.
 */
const saveBoxPromise = () => {
    
    console.log("saveBoxPromise starts");
    
    //clear up UI elements
    $(".trMenuWrapper").addClass("hideElement"); //hides all stateWrapper UI elements
    $("#loadingStateWrapper").removeClass("hideElement");
    $(".saveWarning").removeClass("hideElement");

    //remove dragging utility from boxes
    document.querySelectorAll(".draggable_resizable_object").forEach(e => e.classList.remove("draggable_resizable_object"));

    return save_boxes_to_server(project_id, save_id, bounding_boxes, transcription_json, imagePropertiesObject, SAVE_JSON_PHP_PATH).then(data => {

        bounding_boxes = data["bounding_boxes"];
        transcription_json = data["transcription"];

        $(".saveWarning").addClass("hideElement");
        console.log("saveLinePromise done");

    }).catch(error => {
        console.log(error) 
        functionInitErrorWidget("");
    });
};

/**
 * Reloads the page based on the data from the server.
 * @returns {Promise} A promise that resolves when the page is reloaded and the data is fetched successfully.
 */
const reloadPagePromise = () => {

    //clear up UI elements
    $("#trMenu").addClass("hideElement"); //hides all stateWrapper UI elements
    $("#loadingStateWrapper").removeClass("hideElement");

    console.log("reloadPagePromise starts");

    //remove dragging utility from boxes
    document.querySelectorAll(".draggable_resizable_object").forEach(e => e.classList.remove("draggable_resizable_object"));

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
        

        return initTranscriptionList(bounding_boxes, transcription_json);
    }).then((new_transcription_json) => {
        
        transcription_json = new_transcription_json;

        console.log("reloadPagePromise done");
        
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

const trPageHandleKeyUpEvents = (event) => handleKeyUpEvents(event, undefinedClusterColorHex, imagePropertiesObject, "post_processing");


/**
 * Handles various events.
 */
const functionActivateDragDropChangingHandler = () => {

    const resizerConst = 0.5; //for canvas sizes

    // activate keyup and keydown events: primarily, SPACE and DELETE
    document.addEventListener('keydown', handleKeyDownEvents);
    document.addEventListener('keyup', trPageHandleKeyUpEvents);

    let last_activated_transcription_list_element = null;

    // activate mousedown events: displaying, selecting, vibrating boxes, clusters (alphabet) and canvases (graphic alphabet view)
    $(document).on("mousedown", function(event){ 
        
        // hide/display boxes of selected cluster and also draw them on the graphic alphabet view
        if($(event.target).hasClass("trListElements")){
            
            const selectedClusterid = $(event.target).data("cluster_id");

            document.querySelectorAll("div.boxes").forEach((box) => {

                if(!box.classList.contains("selectedCluster") && !box.classList.contains("clicked_border")){
                    box.classList.add("hideElement");
                }
                
                if(parseInt(box.dataset.cluster_id) === selectedClusterid){
                    if($(event.target).hasClass("activeListElement")){
                        box.classList.remove("selectedCluster");
                        if(!box.classList.contains("clicked_border")){ // we would like to always see the selected boxes
                            box.classList.add("hideElement");
                        }
                        
                    }
                    else{
                        box.classList.add("selectedCluster");
                        box.classList.remove("hideElement");

                    }
                }

            });
            
            //remove previous canvases
            $("canvas").remove();


            document.querySelectorAll(".boxes").forEach(function (item, index) { 

                if(parseInt(item.dataset.cluster_id) === selectedClusterid){

                    const canvasid = "canvas_" + item.id;

                    if($(event.target).hasClass("activeListElement")){
                        $("#"+canvasid).remove();
                    }
                    else{
                        
                        redrawCanvasOfSingleBox(item, resizerConst);
                    }  

                }        
            });
            

            if($(event.target).hasClass('activeListElement')){
                $(event.target).removeClass("activeListElement");    
                // $(".canvasWrapper").hide().show(0); //force DOM redraw to get rid of "residue" canvases

            }
            else{
                $(event.target).addClass("activeListElement");
                last_activated_transcription_list_element = event.target; // ? Maybe exclude the "?" cluster from this?
            }

            $(".canvasWrapper").hide().show(0); //force DOM redraw to get rid of "residue" canvases

            

            
        }

        // select/unselect boxes
        if($(event.target).hasClass("boxes")){

            if($(event.target).hasClass("clicked_border")){
                $(event.target).removeClass("clicked_border");
            }
            else{
                $(event.target).addClass("clicked_border");
                //set scrollbar to corresponding list element, "-20" is just to not have it on exactly the top of the list, but just somewhat further down
                document.querySelector("#trMenu").scrollTop = document.querySelector(`#cluster_${event.target.dataset.cluster_id}`).offsetTop - 100;
            }

            if($(event.target).hasClass("animateBox")){
                $(event.target).removeClass("animateBox");
                const targetedCanvas = document.querySelector(`#canvas_${event.target.id}`);
                if(targetedCanvas !== null){
                    targetedCanvas.classList.remove("selectedCanvas");
                }
            }

        }

        // "vibrate" box on selected canvas (graphic alphabet view)
        if($(event.target).hasClass("selectableCanvasElement")){

            const canvasString = "canvas_";
            const boxId = event.target.id.substring(event.target.id.indexOf(canvasString)+canvasString.length);

            if($(event.target).hasClass("selectedCanvas")){
                
                document.querySelector(`#${boxId}`).classList.remove("animateBox");
                event.target.classList.remove("selectedCanvas");

            }
            else{

                const selectedBox = document.querySelector(`#${boxId}`);
                
                if(selectedBox !== null){
                    selectedBox.classList.add("animateBox");
                    event.target.classList.add("selectedCanvas");

                    //scroll to vibrated box, "-100" is just to not have it on exactly the top of the page, but just somewhat further down
                    document.documentElement.scrollTop = selectedBox.offsetTop - 100; 
                }
                
            }
        }

        // "vibrate" canvas (graphic alphabet view) on selected box
        if($(event.target).hasClass("selectedCluster")){

            const canvasId = "#canvas_" + event.target.id;
            
            if(document.querySelector(canvasId) !== null){ //check if canvas exists or not
                if($(canvasId).hasClass("animateCanvas")){
                
                    document.querySelector(canvasId).classList.remove("animateCanvas");
                    event.target.classList.remove("clicked_border");
                }
                else{
    
                    document.querySelector(canvasId).classList.add("animateCanvas");
                    event.target.classList.add("clicked_border");
                }
            }
            
            
        }

        // remove "vibrate" from canvas (graphic alphabet view) and selection from corresponding box
        if($(event.target).hasClass("animateCanvas")){
            const canvasString = "canvas_";
            const boxId = event.target.id.substring(event.target.id.indexOf(canvasString)+canvasString.length);
            document.querySelector(`#${boxId}`).classList.remove("clicked_border");
            event.target.classList.remove("animateCanvas");

        }
        
    });

    // redraws canvas of moved box on graphic alphabet view
    $(document).on("mouseup", function(event){ 
        if($(event.target).hasClass("boxes") && document.querySelector("#canvas_"+event.target.id) !== null){

            redrawCanvasOfSingleBox(event.target, resizerConst);
            
        }
    });

    // redraws canvas of resized box on graphic cluster view
    $(document).on("resizestop", function(event){

        if($(event.target).hasClass("boxes") && document.querySelector("#canvas_"+event.target.id) !== null){

            redrawCanvasOfSingleBox(event.target, resizerConst);
            
        }
    });

    // resets the visibility of boxes and clusters to the initial state
    $(document).on("click", "#showAllBoxesButton", function(e){

        showAllBoxes();

    });

    // adds a new (undefined) box to the image 
    $(document).on("click", "#addBoxButton", function(event){

        handleAddingBoxEvent(event, undefinedClusterColorHex, imagePropertiesObject, "post_processing");

    });

    // removes all the selected boxes from the image
    $(document).on("click", "#removeBoxButton", function(){

        $(".clicked_border").remove();
            

    });

    /**
     * Moves selected boxes into selected cluster by changing
     * their cluster_id, transcription and color, only happens in the DOM, not synchronized with
     * the server.
     */ 
    $(document).on("mousedown", "#addToClusterButton", function(){

        // move selected boxes into selected cluster in the DOM
        const selectedListElem = last_activated_transcription_list_element;
        const newClusterId = selectedListElem.dataset.cluster_id;
        const new_transcription = selectedListElem.dataset.transcription;
        const hexColor = selectedListElem.dataset.color;

        document.querySelectorAll(".clicked_border").forEach((box, index) => {

            box.classList.remove("clicked_border");

            if(box.dataset.cluster_id !== newClusterId){

                box.dataset.cluster_id = newClusterId;
                box.dataset.color = hexColor;
                box.dataset.transcription = new_transcription;
                const color = hexToRgb(hexColor);
                const rgbaColor = `rgba(${color.r}, ${color.g}, ${color.b}, 0.4)`;
                box.style.background = rgbaColor;

                const input_field = last_activated_transcription_list_element.querySelector(".transcriptionDone");
                box.querySelectorAll("b.transcriptionPreview").forEach(e => e.remove());

                // add or remove transcriptedCluster depending on the new cluster
                let checkBoxOfNewCluster = null;
                document.querySelectorAll("li.trListElements").forEach(e => {
                    if(e.dataset.cluster_id === newClusterId){
                        checkBoxOfNewCluster = e.querySelector("input.trListCheckbox");
                    }
                });
                if(checkBoxOfNewCluster !== null && checkBoxOfNewCluster.checked){
                    box.classList.add("transcriptedCluster");
                }
                else{
                    box.classList.remove("transcriptedCluster");
                }
                
                if(input_field !== null){
                    let tr_b = document.createElement('b');
                    tr_b.className = "transcriptionPreview";
                    tr_b.textContent = new_transcription;
                    if(!document.querySelector("#transcriptionPreviewButton").classList.contains("activeToggle")){ // hide transcription preview if it is not active
                        tr_b.classList.add("hideElement"); 
                    }
                    box.appendChild(tr_b);   
                    
                }

                redrawCanvasOfSingleBox(box, resizerConst);
                
            }

        });

    });

    /**
     * Moves selected boxes into the undefined cluster by changing
     * their cluster_id, transcription and color, only happens in the DOM, not synchronized with
     * the server.
     */ 
    $(document).on("mousedown", "#removeFromClusterButton", function(){

        //First, move all selected boxes into the undefined cluster in the DOM
        document.querySelectorAll(".clicked_border").forEach((box, index) => {

            box.querySelectorAll("b.transcriptionPreview").forEach(e => e.remove());

            //set all attributes of box to undefined
            box.dataset.cluster_id = "-2";
            box.dataset.color = undefinedClusterColorHex;
            box.dataset.transcription = "?";

            let tr_b = document.createElement('b');
            tr_b.className = "transcriptionPreview";
            tr_b.textContent = "?";
            if(!document.querySelector("#transcriptionPreviewButton").classList.contains("activeToggle")){ // hide transcription preview if it is not active
                tr_b.classList.add("hideElement"); 
            }
            box.appendChild(tr_b);

            // add or remove transcriptedCluster depending on the new cluster
            let checkBoxOfNewCluster = null;
            document.querySelectorAll("li.trListElements").forEach(e => {
                if(e.dataset.cluster_id === "-2"){
                    checkBoxOfNewCluster = e.querySelector("input.trListCheckbox");
                }
            });
            
            if(checkBoxOfNewCluster !== null && checkBoxOfNewCluster.checked){
                box.classList.add("transcriptedCluster");
            }
            else{
                box.classList.remove("transcriptedCluster");
            }

            const color = hexToRgb(undefinedClusterColorHex);
            const rgbaColor = `rgba(${color.r}, ${color.g}, ${color.b}, 0.4)`;
            box.style.background = rgbaColor;

            box.classList.remove("clicked_border");

            const correspondingCanvas = document.querySelector("#canvas_"+box.id);

            if(correspondingCanvas !== null){
                correspondingCanvas.remove();
            }

        });
        

    });

    /**
     * Moves selected boxes into new cluster by changing their cluster_id, transcription and color.
     * Also, a transcription list element (left menu) is created for the new cluster.
     * Only happens in the DOM, not synchronized with the server.
     */ 
    $(document).on("mousedown", "#createNewClusterButton", function(){

        //First, find the largest cluster id and increase it by one. This will be the id of the new cluster.
        var largest_id = 0;

        document.querySelectorAll(".trListElements").forEach(item => {
            if(parseInt(item.dataset.cluster_id) > largest_id){
                largest_id = parseInt(item.dataset.cluster_id);
            }
        });

        largest_id += 1;

        //Second, create a non-red color.

        const tries = Math.floor(Math.random()*50)+50;

        let new_colors = Array(tries).fill().map((value, index) => rainbow(tries, index));
        let selectedColor = "";
        
        shuffleArray(new_colors);

        for (let value of new_colors) {
            const rgbCodedColor = hexToRgb(value);
            if(rgbCodedColor.r < 200 || rgbCodedColor.b > 150 || rgbCodedColor.g > 150){
                selectedColor = value;
                break;
            }
        }

        //Third, add the cluster to the transcription list.
        createTranscriptionListElement(String(largest_id), selectedColor, "");

        //Fourth, move all selected boxes into this cluster in the DOM
        document.querySelectorAll(".clicked_border").forEach((box, index) => {

            box.dataset.cluster_id = largest_id;
            box.dataset.color = selectedColor;
            box.dataset.transcription = "";

            const rgbColor = hexToRgb(selectedColor);
            const rgbaColor = `rgba(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b}, 0.4)`;
            box.style.background = rgbaColor; 

            box.classList.remove("clicked_border");
            box.classList.remove("transcriptedCluster");

            box.querySelectorAll("b.transcriptionPreview").forEach(e => e.remove());

            const correspondingCanvas = document.querySelector("#canvas_"+box.id);

            if(correspondingCanvas !== null){
                correspondingCanvas.remove();
            }

        });

        //Finally, trigger event on the transcription list element to display the new cluster
        $(`#cluster_${largest_id}`).trigger('mousedown');

    }); 

    /**
     * Removes selected clusters (from transcription list) and moves their boxes into the undefined cluster by changing their cluster_id,
     * transcription and color. Only happens in the DOM, not synchronized with the server.
     */
    $(document).on("mousedown", "#removeClusterButton", function(){

        //First, check if undefines cluster (id=0) is selected or not, if yes display warning and return
        if(document.querySelector("#cluster_-2").classList.contains("activeListElement") || document.querySelector("#cluster_-1").classList.contains("activeListElement")){
            
            functionInitErrorWidget("Warning: the \"undefined\" and \"SPACE\" clusters cannot be removed, unselect it and try again to remove other clusters.");
            return ;
        }

        //Second, find selected clusters and remove them
        const listOfClustersToBeRemoved = Array.from(document.querySelectorAll(".activeListElement")).map(e => e.dataset.cluster_id); 

        document.querySelectorAll(".activeListElement").forEach(e => e.remove());

        console.log(listOfClustersToBeRemoved);

        // Third, remove the clusters from transcription_json
        // Note: this is the only way to remove clusters from the transcription_json apart from  directly overwriting all of them by e.g. async_kmeans.py
        listOfClustersToBeRemoved.forEach(e => delete transcription_json["transcriptions"][e]);
        
        console.log(transcription_json);

        //Finally, move all corresponding boxes into the undefined cluster in the DOM
        document.querySelectorAll("div.boxes").forEach(box => {
            if(listOfClustersToBeRemoved.includes(box.dataset.cluster_id)){

                box.querySelectorAll("b.transcriptionPreview").forEach(e => e.remove());

                box.dataset.cluster_id = "-2";
                
                const color = hexToRgb(undefinedClusterColorHex);
                const rgbaColor = `rgba(${color.r}, ${color.g}, ${color.b}, 0.4)`;
                box.dataset.color = undefinedClusterColorHex;
                box.dataset.transcription = "?";

                let tr_b = document.createElement('b');
                tr_b.className = "transcriptionPreview";
                tr_b.textContent = "?";
                if(!document.querySelector("#transcriptionPreviewButton").classList.contains("activeToggle")){ // hide transcription preview if it is not active
                    tr_b.classList.add("hideElement"); 
                }
                box.appendChild(tr_b);

                // add or remove transcriptedCluster depending on the new cluster
                let checkBoxOfNewCluster = null;
                document.querySelectorAll("li.trListElements").forEach(e => {
                    if(e.dataset.cluster_id === "-2"){
                        checkBoxOfNewCluster = e.querySelector("input.trListCheckbox");
                    }
                });
                if(checkBoxOfNewCluster !== null && checkBoxOfNewCluster.checked){
                    box.classList.add("transcriptedCluster");
                }
                else{
                    box.classList.remove("transcriptedCluster");
                }


                box.style.background = rgbaColor;
                box.classList.remove("clicked_border");

                

                const correspondingCanvas = document.querySelector("#canvas_"+box.id);

                if(correspondingCanvas !== null){
                    correspondingCanvas.remove();
                }
            }
        });
    });

    // Adds or removes a "darkening" of boxes of a cluster (from alphabet, left menu) when the user clicks on the corresponding checkbox.
    // This "darkening" indicates that the cluster is completely cleaned up and transcribed.
    // The "darkening" is only a visual aid and does not affect the boxes in any way.
    $(document).on("change", ".trListCheckbox", function(){

        const isChecked = this.checked;
        const selectedCluster = parseInt(this.parentElement.getAttribute('data-cluster_id'));
        console.log(isChecked, selectedCluster);

        Array.from(document.querySelectorAll(".image_area .boxes")).forEach(div_obj => {
            console.log(div_obj, parseInt(div_obj.getAttribute('data-cluster_id')) === selectedCluster);

            if (parseInt(div_obj.getAttribute('data-cluster_id')) === selectedCluster) {
                if (isChecked) {
                    div_obj.classList.add("transcriptedCluster");
                } else {
                    div_obj.classList.remove("transcriptedCluster");
                }
            }
        });
        
    });

    /**
     * Activated when the user enters transcription into an input field. Check first if the entered transcription contains
     * any whitespaces (that is not permitted), if yes returns without executing, if no enters the transcription into the DOM and
     * adds preview elements.
     * Only happens in the DOM, not synchronized with the server.
     */
    document.querySelectorAll('.trListTranscription').forEach(function(element) {
        element.addEventListener('input', function(event) {

            // First, get user input (transcription) and check if it contains any whitespaces, if yes return and display warning
            const inputValue = this.value;

            if(inputValue.includes(" ")){
                this.value = ""; //remove transcription
                
                functionInitErrorWidget("Warning: transcription cannot contain any whitespaces. The entered transcription has been removed.");
                return ;
            }

            // Second, enter transcription into DOM (into the boxes of the selected cluster) and also add preview elements to them
            const cluster_id = parseInt(this.parentElement.dataset.cluster_id);

            this.parentElement.dataset.transcription = inputValue;

            document.querySelectorAll(".boxes").forEach(box => {

                if(parseInt(box.dataset.cluster_id) === cluster_id){

                    box.querySelectorAll("b.transcriptionPreview").forEach(e => e.remove());
                    box.dataset.transcription =  inputValue;

                    if(inputValue !== ""){
                        let tr_b = document.createElement('b');
                        tr_b.className = "transcriptionPreview";
                        tr_b.textContent = inputValue;
                        if(!document.querySelector("#transcriptionPreviewButton").classList.contains("activeToggle")){ // hide transcription preview if it is not active
                            tr_b.classList.add("hideElement"); 
                        }
                        box.appendChild(tr_b);
                    }
                    
                } 

            });
                
            // Finally, add styling class to the input field
            if(inputValue === ""){
                this.classList.remove("transcriptionDone");
            }
            else{
                this.classList.add("transcriptionDone");
            }

        });
    });


    // Shows or hides the transcription preview elements of all the boxes.
    $(document).on("click", "#transcriptionPreviewButton", function(){

        if($(this).hasClass("activeToggle")){
            $(this).removeClass("activeToggle");
            $(".transcriptionPreview").addClass("hideElement");
        }
        else{
            $(this).addClass("activeToggle");
            $(".transcriptionPreview").removeClass("hideElement");
        }
        
    });

};

const {Machine, interpret, assign} = XState;


/**
 * The webpage is driven by a state machine. Most of the logic is handled by the state machine
 * with a few exceptions (like handling the "menu" button). Although compared to the other two pages
 * with a state machine, this one is simpler and barely needs the state machine structure.
 * We use a state machine here more for consistency with the other pages.
 *
 * @typedef {Object} WebPageMachine
 * @property {Object} states - The states of the machine:
 *      - active: contains the main states which execute the logic of the page.
 *          - hist: functional state that keeps track of the history of the active state, so that we could return to the last "active" state even
 * after entering another state outside of the "active" state, like "reloadPage" or "globalErrorState".
 *          - imageInit: loads the image and initializes the page. It is a transitional state which only runs once.
 *          - transcription: exports out the project. This is the "main" state of this page, the user will be for the most part in this state.
 * Has many sub-states and can transition into many other states.
 *      - reloadPage: reloads the entire page with the data from the server. When done returns back through the "hist" state
 * to the last "active" state. This is usually the "transcription" state.
 *      - globalErrorState: handles all the errors that occur in any other state. When done returns back through the "hist" state
 * to the last "active" state. This is usually the "transcription" state.
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
                        onDone: {target: "#transcription"}
                    } 
                },
                transcription: {
                    id: 'transcription',
                    initial: 'init',
                    on: { ERROREVENT: '#globalErrorState' },
                    states: {
                        init: {
                            id: 'transcriptionInit',
                            invoke: {
                                src: initTranscriptionPromise,
                                onDone: 'ready'
                            }
                        },
                        ready: { 
                            entry: ['activateDragDropChangingHandler'],
                            initial: 'pending', 
                            states: {
                                pending: {
                                    on: {
                                        EXPORT_BUTTON_PRESS: {target: 'saving', actions: assign({stateQueue: '#export', parentState: 'transcription'})}, 
                                        RELOAD_PAGE_BUTTON_PRESS: {target: '#reloadPage', actions: assign({parentState: 'transcription'})},
                                        USER_SAVE_BUTTON_PRESS: {target: 'saving', actions: assign({stateQueue: '#transcriptionInit', parentState: 'transcription'})},
                                        
                                    },
                                    exit: ['deactivateDragDropChangingHandler'],
                                },
                                saving: {
                                    invoke: {
                                        src: (context, event) => saveBoxPromise(context.parentState), 
                                        onDone: [
                                            {target: '#export', cond: (context, event) => context.stateQueue === "#export"}, 
                                            {target: '#transcriptionInit', cond: (context, event) => context.stateQueue === "#transcriptionInit"},
                                            
                            //if no guard evaluates to true then go to error state, just to keep the state machine going, otherwise it would get stuck here
                                            {target: '#globalErrorState'} 
                                        ]
                                    } 
                                }
                            },
                            exit: ['clearContext']  
                        },
                        execute: {
                            id: 'export',
                            invoke: {
                                src: executeBackendExportPromise,
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
            $(document).off("mousedown"); 
            $(document).off("mouseup");
            $(document).off("resizestop");
            $(document).off("click", "#addBoxButton"); 
            $(document).off("click", "#removeBoxButton"); 
            $(document).off("mousedown", "#addToClusterButton");
            $(document).off("mousedown", "#removeFromClusterButton");
            $(document).off("mousedown", "#createNewClusterButton");
            $(document).off("mousedown", "#removeClusterButton");
            $(document).off("keydown");
            $(document).off("keyup"); 
            $(document).off("change", ".trListCheckbox");
            $(document).off("input", ".trListTranscription");
            $(document).off("click", "#transcriptionPreviewButton");
            document.removeEventListener('keydown', handleKeyDownEvents);
            document.removeEventListener('keyup', trPageHandleKeyUpEvents);

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

// Log new state on change
// only relevant for development, should be removed in production
    webPageService.onTransition(state => {
        if(state.changed){
            console.log("New state:", state.value); 
        }
    });

// Here we bind the state machine to click events. In other words, on certain click events
// the state machine will receive a signal to transition to another state.
// See for example the "RELOAD_PAGE_BUTTON_PRESS" signal in the "transcription" state.

    // user clicks to reload the page: state machine receives signal to transition accordingly
    $("#reloadButton").click( () => {
        console.log("start transition RELOAD_PAGE_BUTTON_PRESS");
        webPageService.send('RELOAD_PAGE_BUTTON_PRESS');        

    });

    // user clicks to export out the project: state machine receives signal to transition accordingly
    $(document).on("click", "#exportButton", function(){
        console.log("start transition EXPORT_BUTTON_PRESS");
        webPageService.send('EXPORT_BUTTON_PRESS'); 
    });

    // user clicks to save the page: state machine receives signal to transition accordingly
    $(document).on("click", "#saveButton", function(){
        console.log("start transition USER_SAVE_BUTTON_PRESS");
        webPageService.send('USER_SAVE_BUTTON_PRESS');     

    });


    // On error widget button click, which means closing the widget, we send a signal to the state machine
    // to transition back to the last active state.
    $(".errorButton").click( () => {
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