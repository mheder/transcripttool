/************************************************************************************************************
 * Util functions for often used large state operations.

***************************************************************************************************************/

"use strict";

import {
    FLOAT_PRECISION,
} from '../config/config.js';

import {
    is_numbering_in_range, siblings, round_float, init_drag, undefinedClusterColorHex
} from './generic_utils.js';

import {
    rainbow, hexToRgb, shuffleArray, AssociateColorsWithClusters
} from './cluster_color_utils.js';

//................................................GLOBAL  CONSTANTS.........................................................................

const BOX_HEIGHT_WIDTH_REMOVAL_THRESHOLD = 0.008; // boxes which have either their width or height under this threshold are removed

//....................................................FUNCTIONS.............................................................................


/**
 * Removes old boxes from an image, retrieves bounding box and transcription data from the server, associates colors with clusters, and
 * adds new boxes to the image based on the retrieved data.
 * @param {String} project_id - Generated id of project which uniquely identifies the project on the server;
 * together with the `save_id` it is used to retrieve data from the server.
 * @param {String} save_id - Generated id of save which uniquely identifies the save inside its project folder; together with the `project_id` it is used
 * to retrieve data from the server.
 * @param {Object} imagePropertiesObject - An object that contains properties of each image. The keys of the
 * object are the image IDs, and the values are objects containing the image properties such as width,
 * height, positionTop, positionLeft, and so on.
 * @param {String} fromWhichStateisCalled - Indicates the state from which the `placeBoxesOnImage` function is called. It is used to determine
 * the behavior of the function based on the specific state.
 * @param {String} PATH_TO_PHP - Contains the path to the PHP file that is
 * responsible for loading the data from the server.
 * @param {String} SAVE_JSON_PHP_PATH - Contains the path to the PHP file that is responsible for saving the data, it is required here,
 * as the `AssociateColorsWithClusters` function might change the data.
 * @returns {Promise} Returns a Promise that resolves to an object containing the transcription data (it is returned as it might have changed
 * through the calling of the `AssociateColorsWithClusters` function).
 */
const placeBoxesOnImage = (project_id, save_id, imagePropertiesObject, fromWhichStateisCalled="", PATH_TO_PHP="load_json.php", SAVE_JSON_PHP_PATH="save_json.php") => {

    console.log("placeBoxesOnImage starts");

    let local_bounding_boxes, local_transcription_json;

    document.querySelectorAll(".image_area div.boxes").forEach(e => e.remove()); //remove first all "old" boxes before adding the new ones

    const payloadToServer = {
        "project_id": project_id,
        "save_id": save_id
    };
    

    // Load the data from the server.
    return fetch(PATH_TO_PHP, { //load_json.php
        method: 'POST', 
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payloadToServer)
    }).then(response => {
        return response.json();
    }).then(data => {

        console.log(data);

        local_bounding_boxes = data["bounding_boxes"];
        local_transcription_json = data["transcription"];

        // First, if necessary, then we generate colors for each cluster.
        return AssociateColorsWithClusters(project_id, save_id, local_bounding_boxes, local_transcription_json, SAVE_JSON_PHP_PATH); //save_json.php
    }).then((response) => {

        local_transcription_json = response;

        // Iterate over each image first.
        Object.keys(local_bounding_boxes["documents"]).forEach((key, i) => {

            const imageProperties = imagePropertiesObject[key];

            // Iterate over all the boxes inside the current image.
            local_bounding_boxes["documents"][key].forEach((item, j) => {

                let box = document.createElement('div');

                //fallback values for properties if nothing else available
                let isTRpreview = false;
                let color = undefinedClusterColorHex;
                let transcription = "";
                let cluster_id = "-2";

                // Overwrite fallback values if there is any actual value associated with a given property.
                if(item.hasOwnProperty("cluster_id")){

                    cluster_id = String(item.cluster_id);

                    if(local_transcription_json["transcriptions"].hasOwnProperty(cluster_id)){
                        const cluster_color_association = local_transcription_json["transcriptions"][cluster_id];
                        transcription =  cluster_color_association["transcription"];
                        color =  cluster_color_association["color"];
                    }
                    else{
                        console.warn(`Warning! The following cluster_id = ${cluster_id} does not exist
                            in the transcription_json, but is associated with the box =`, item);
                    }
                    
                }

                
                // Possible states in image_processing.js: asyncLineSegmentation, asyncSegmentation, fewShots, few_shot_train, asyncClustering, asyncLabelPropagation
                // Possible states in post_processing.js: transcription
                const STATES_WITH_FIXED_COLOR = ["asyncLineSegmentation", "asyncSegmentation"];

                box.dataset.color = color; //* so that the clustercolor won't be overwritten by a call from a state with fixed color, this way we won't lose the color
                //* and we can use this information to update the data on the server when are saving the boxes (see function "save_boxes_to_server")

                if(STATES_WITH_FIXED_COLOR.includes(fromWhichStateisCalled)){ // use the same fixed color for all the boxes, when no clusters need to be displayed
                    color = undefinedClusterColorHex;
                }
                else if(fromWhichStateisCalled === "transcription"){ // in this case, get transcription from DOM

                    const transcriptionListElement = document.querySelector(`#cluster_${cluster_id}`);

                    if(transcriptionListElement !== null && transcriptionListElement.querySelector("input").value !== ""){
                        transcription = transcriptionListElement.querySelector("input").value;
                    }

                    if(transcription !== ""){
                        isTRpreview = true;
                    }

                }

                // Setting up the new box.
                const w_id = `name_${i}_${j}`; //unique name, only used here internally
                const w_width = round_float(item.width * (imageProperties.width), FLOAT_PRECISION);
                const w_height = round_float(item.height * (imageProperties.height), FLOAT_PRECISION);
                const w_top = round_float(item.top * imageProperties.height + imageProperties.positionTop, FLOAT_PRECISION);
                const w_left = round_float(item.left * imageProperties.width + imageProperties.positionLeft, FLOAT_PRECISION);
                
                
                box.setAttribute("class", "boxes draggable_resizable_object");
                box.setAttribute("id", w_id);
                box.style.left = w_left + 'px';
                box.style.top = w_top + 'px';
                box.style.width = w_width + 'px';
                box.style.height = w_height + 'px';
                const rgbcolor = hexToRgb(color);
                box.style.background = `rgba(${rgbcolor.r}, ${rgbcolor.g}, ${rgbcolor.b}, 0.4)`;
                box.dataset.cluster_id = cluster_id;
                box.dataset.transcription = transcription;
                box.dataset.parent_image = key;

                
                if(item.width > BOX_HEIGHT_WIDTH_REMOVAL_THRESHOLD && item.height > BOX_HEIGHT_WIDTH_REMOVAL_THRESHOLD){
                    document.querySelector(".image_area").appendChild(box);

                    if(item.hasOwnProperty("frozen")){
                        box.classList.add("frozen");
                    }

                    const trListElements = Array.from(document.querySelectorAll("li.trListElements")).filter(li => li.dataset.cluster_id === cluster_id);

                    if(trListElements !== null && trListElements.length === 1){

                        const checkbox = trListElements[0].querySelector("input.trListCheckbox");

                        if(checkbox !== null && checkbox.checked){
                            box.classList.add("transcriptedCluster");
                        }
                    }

    
                    if(isTRpreview){
                        let preview = document.createElement('b');
                        preview.setAttribute("class", "transcriptionPreview");
                        preview.textContent = transcription;
                        document.getElementById(w_id).appendChild(preview);   
                    }
                }
                else{ // ! not adding boxes, which have virtually zero height or width, to DOM
                    console.warn("Box removed because of zero height or width:", box);
                }
                
            });

        });

        const trPreviewButton = document.querySelector("#transcriptionPreviewButton");

        if(trPreviewButton !== null && !trPreviewButton.classList.contains("activeToggle")){
            document.querySelectorAll(".transcriptionPreview").forEach(e => e.classList.add("hideElement"));
        }

        //Initialize draggable behavior on boxes.
        init_drag("div.boxes.draggable_resizable_object");

        console.log("placeBoxesOnImage done");

        return local_transcription_json;

    }).catch(error => console.warn(error));
};


/**
 * Takes the bounding box and transcription data present on the UI and saves it on the server.
 * @param {String} project_id - Generated id of project which uniquely identifies the project on the server;
 * together with the `save_id` it is used to retrieve data from the server.
 * @param {String} save_id - Generated id of save which uniquely identifies the save inside its project folder; together with the `project_id` it is used
 * to retrieve data from the server.
 * @param {Object} bounding_boxes - Contains the information on images and boxes with cluster_id.
 * @param {Object} transcription_json - Contains the cluster_id to transcription mapping.
 * @param {Object} imagePropertiesObject - An object that contains properties of each image. The keys of the
 * object are the image IDs, and the values are objects containing the image properties such as width,
 * height, positionTop, positionLeft, and so on.
 * @param {String} PATH_TO_PHP - Contains the path to the PHP file that is responsible for saving the data.
 * @returns {Promise} Returns an empty Promise.
 */
const save_boxes_to_server = (project_id, save_id, bounding_boxes, transcription_json, imagePropertiesObject, PATH_TO_PHP="save_json.php") => {

    console.log("save_boxes_to_server starts");

    // Create a deep clone of the objects which hold the data, changing the original variables could result in bugs which might be extremely hard to discover.
    let local_transcription_json = structuredClone(transcription_json);
    let local_bounding_boxes = structuredClone(bounding_boxes);

    return new Promise((resolve, reject) => {

        Object.keys(local_bounding_boxes["documents"]).forEach(e => local_bounding_boxes["documents"][e].length = 0); // clear out the previous data

        const listOfBoxesToSave = document.querySelectorAll("div.boxes");

        let already_changed_clusters = []; // bookkeeping variable to see which cluster changed already, the purpose is to avoid changing one over and over

        for (const box of listOfBoxesToSave){ // Iterate over all the boxes which are present in the DOM.

            let is_parent_image_found = false;
            let rect_data = {};

            // We iterate over the images to see where the boxes belong to, once the parent image is found, then the box is saved right away.
            // Note: once we successfully match a box into an image, then we do not check if there is a better fit with another image. Considering
            // our DOM setup a box should only have a successful match with a single image.
            for (const [key, elem] of Object.entries(imagePropertiesObject)){ // iterate over all the images

                rect_data = { // We do not include here properties like color or transcription, as they are saved into the transcription object.
                    "cluster_id": box.dataset.cluster_id === undefined ? "-2" : box.dataset.cluster_id,
                    "left": round_float((parseFloat(box.style.left) - elem.positionLeft) / elem.width, FLOAT_PRECISION),
                    "top": round_float((parseFloat(box.style.top) - elem.positionTop) / elem.height, FLOAT_PRECISION), 
                    "width": round_float(parseFloat(box.style.width) / elem.width, FLOAT_PRECISION),
                    "height": round_float(parseFloat(box.style.height) / elem.height, FLOAT_PRECISION),
                };

                
                // Check if box coordinates are fitting (i.e., positive, between 0 and 1), allow 10% overhang though on each side.
                // If a box is not contained in any image, then it will not be saved and will simply vanish.
                if(is_numbering_in_range(-0.1, rect_data.left, 1.0) && is_numbering_in_range(-0.1, rect_data.top, 1.0) &&
                is_numbering_in_range(0, rect_data.left + rect_data.width, 1.1) && is_numbering_in_range(0, rect_data.top + rect_data.height, 1.1)){

                    is_parent_image_found = true;

                    const before_clipping = structuredClone(rect_data); // only for logging, if need be might be removed
                    let did_any_clipping_happen = false; // only for logging

                    // Clip down boxes to size, if they had an overhang.
                    //? are there any more cases which could be sensibly adjusted?
                    if(rect_data.left + rect_data.width > 1){
                        rect_data.width = round_float((1 - rect_data.left) * 0.99, FLOAT_PRECISION);
                        did_any_clipping_happen = true;
                    }
                    if(rect_data.top + rect_data.height > 1){
                        rect_data.height = round_float((1 - rect_data.top) * 0.99, FLOAT_PRECISION);
                        did_any_clipping_happen = true;
                    }
                    if(rect_data.left < 0){
                        rect_data.width = round_float((rect_data.width + rect_data.left) * 0.99, FLOAT_PRECISION);
                        rect_data.left = 0;
                        did_any_clipping_happen = true;
                    }
                    if(rect_data.top < 0){
                        rect_data.height = round_float((rect_data.height + rect_data.top) * 0.99, FLOAT_PRECISION);
                        rect_data.top = 0;
                        did_any_clipping_happen = true;
                    }

                    if(did_any_clipping_happen){
                        console.log("before and after clipping down:", before_clipping, rect_data);
                    }

                    if(box.classList.contains("frozen")){
                        rect_data["frozen"] = ""; // ? what to do with the corresponding lines? Where shall we address them?
                    }

                    // We update the current transcription data based on the boxes in the DOM.
                    if(!already_changed_clusters.includes(box.dataset.cluster_id)){
                        local_transcription_json["transcriptions"][box.dataset.cluster_id] = {
                            "color": box.dataset.color === undefined ? undefinedClusterColorHex : box.dataset.color,
                            "transcription": box.dataset.transcription === undefined ? "" : box.dataset.transcription
                        };
                        already_changed_clusters.push(box.dataset.cluster_id);
                    }


                    // ! do not save boxes which have virtually zero height or width
                    if(rect_data["width"] > BOX_HEIGHT_WIDTH_REMOVAL_THRESHOLD && rect_data["height"] > BOX_HEIGHT_WIDTH_REMOVAL_THRESHOLD){
                        local_bounding_boxes["documents"][key].push(rect_data);
                    }
                    else{
                        console.warn("Box removed because of zero height or width:", rect_data);
                    }

                    break;
                }

            }

            if(!is_parent_image_found){ // Log boxes which do not belong to any image, they might reveal bugs.
                console.warn("Box is not contained in any image=", box);
                continue; // not strictly necessary, but just to make sure
            }

        }

        document.querySelectorAll(".image_area div.boxes").forEach(e => e.remove()); // remove the boxes

        console.log("bounding_boxes=", local_bounding_boxes);
        console.log("local_transcription_json=", local_transcription_json);

        // Save the data on the server.
        const payload_to_server = {
            "bounding_boxes": local_bounding_boxes,
            "transcription": local_transcription_json,
            "project_id": project_id,
            "save_id": save_id
        };
        

        fetch(PATH_TO_PHP, { //save_json.php
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload_to_server)
            }).then(response => {
                return response.json()
            }).then(data => {
                resolve(data);
                console.log(data);
                console.log("save_boxes_to_server done");
        });

    });
};

/**
 * Exports the project by creating a zip file containing bounding box
 * data, transcription data, and image files, and then downloads the zip file on the user's machine.
 * @param {String} project_id - Generated id of project which uniquely identifies the project on the server;
 * together with the `save_id` it is used to retrieve data from the server.
 * @param {String} save_id - Generated id of save which uniquely identifies the save inside its project folder; together with the `project_id` it is used
 * to retrieve data from the server.
 * @param {Object} lookup_table - The `lookup_table` parameter is an object that contains information about the
 * mapping between image names and user-given names. It has the following structure:
 * @param {Object} bounding_boxes - Contains the information on images and boxes with cluster_id.
 * @param {Object} transcription_json - Contains the cluster_id to transcription mapping.
 * @param {String} DOMAIN - URL of project root.
 * @param {String} PATH_TO_PHP - Path to the PHP file that is responsible for fetching the transcribed lines from the server.
 * @returns {Promise} Returns an empty Promise once the exported data is compressed and the dialogwindow appears on the user's side.
 */
const exportProjectPromise = (project_id, save_id, lookup_table, bounding_boxes, transcription_json, DOMAIN, PATH_TO_PHP="fetch_transcription.php") => {
    return new Promise((resolve, reject) => {

        console.log("exportProjectPromise starts");

        let zip = new JSZip();

        // ! purge unnecessary entries, to a great extent duplicate of post_processing.js -> sendTranscriptionToClient()

        let purged_transcription_json = {
            "transcriptions": {}
        };
        
        Object.keys(transcription_json["transcriptions"]).forEach((key, i) => {
            purged_transcription_json["transcriptions"][key] = {
                "transcription": transcription_json["transcriptions"][key]["transcription"]
            };
        });

        
        // only export out the necessary information: the symbol boxes and the lines
        let purged_bounding_boxes = {
            "documents": bounding_boxes["documents"],
            "lines": bounding_boxes.hasOwnProperty("lines") ? bounding_boxes["lines"] : {},
            "image_name_mapping": lookup_table["image_name_mapping"] // add an entry containing the image name mapping
        };

        zip.file("bounding_boxes.json", JSON.stringify(purged_bounding_boxes));
        zip.file("transcription.json", JSON.stringify(purged_transcription_json));

        const bounding_boxes_keys = Object.keys(bounding_boxes["documents"]);
        let iter = 0;

        // recursively load (we make sure this way to get all images loaded in correctly) and add all project images to the export zip
        const  recursiveImageLoad = (iter) => {
            return new Promise((resolve, reject) => { 
                if(iter === bounding_boxes_keys.length){
                    console.log("zip ready");
                    return resolve(zip);
                }
                const key = bounding_boxes_keys[iter];
                console.log(key);
                const imageURL = `${DOMAIN}/user_projects/${project_id}/${save_id}/${key}`;

                fetch(imageURL).then(response => response.blob()).then(imageBlob => {
                    const user_given_img_name = lookup_table["image_name_mapping"][key];
                    const imgData = new File([imageBlob], user_given_img_name);
                    zip.file(user_given_img_name, imgData, { base64: true });
                    iter += 1;
                    console.log("after loaded ", iter);
                    resolve(recursiveImageLoad(iter));
                });
            });
        };

        const payloadToServer = {
            "save_id": save_id,
            "project_id": project_id
        };

        return fetch(PATH_TO_PHP, { // fetch_transcription.php
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payloadToServer)
        }).then(response => {
            return response.json()
        }).then(data => {

            //this means transcription.txt was found on the server
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
    
            if(Object.keys(data["post_processed_transcription"]).length !== 0){
                const transcriptionObject = data["post_processed_transcription"];
                
    
                Object.entries(transcriptionObject).forEach(([key, value], i) => {
    
                    const user_given_img_name = lookup_table["image_name_mapping"][key];
                    zip.file(`${user_given_img_name.slice(0, user_given_img_name.lastIndexOf('.'))}_post_processed_transcription.txt`, value);
    
                }); 
    
            }

            return recursiveImageLoad(iter);

        }).then(zipped_data => {
            console.log("zip arrived");
            return zipped_data.generateAsync({type: "blob"});
        }).then((content) => {
            saveAs(content, `${lookup_table["user_given_save_name"]}.zip`); // ! Too optimistic to let user given name appear? Alternatively the save_id works.
            resolve();
        });
    });
};


/**
 * Wrapper for the server side script which restores back one image to its original version (it copies the image from the project folder over to the save folder).
 * @param {String} project_id - Generated id of project which uniquely identifies the project on the server;
 * together with the `save_id` it is used to retrieve data from the server.
 * @param {String} save_id - Generated id of save which uniquely identifies the save inside its project folder; together with the `project_id` it is used
 * to retrieve data from the server.
 * @param {String} currentImageName - The image to restore/copy.
 * @param {String} PATH_TO_PHP - Path to the PHP file that is responsible for restoring/copying the image.
 * @returns {Promise} Returns an empty Promise.
 */
function copyImagePromise(project_id, save_id, currentImageName, PATH_TO_PHP="copy_images.php"){
    return new Promise((resolve, reject) => { 
        console.log("copyImagePromise start");

        const payloadToServer = {
            "flag": "image",
            "project_id": project_id,
            "save_id": save_id,
            "currentImageName": currentImageName
        };

        return fetch(PATH_TO_PHP, { // copy_images.php
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payloadToServer)
            }).then(response => {
                return response.json();
            }).then(data => {
                
                console.log("copyImagePromise done");
                resolve();
        });    
    });
    
};


/**
 * Wrapper for the server side script which restores back all the images to their original version in the save
 * (it copies the images from the project folder over to the save folder).
 * @param {String} project_id - Generated id of project which uniquely identifies the project on the server;
 * together with the `save_id` it is used to retrieve data from the server.
 * @param {String} save_id - Generated id of save which uniquely identifies the save inside its project folder; together with the `project_id` it is used
 * to retrieve data from the server.
 * @param {String} PATH_TO_PHP - Path to the PHP file that is responsible for restoring/copying the images.
 * @returns {Promise} Returns an empty Promise.
 */
const copyDocumentPromise = (project_id, save_id, PATH_TO_PHP="copy_images.php") => {
    return new Promise((resolve, reject) => { 
        console.log("copyDocumentPromise start");

        const payloadToServer = {
            "flag": "document",
            "project_id": project_id,
            "save_id": save_id
        };

        return fetch(PATH_TO_PHP, { // copy_images.php
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payloadToServer)
            }).then(response => {
                return response.json()
            }).then(data => {

                console.log("copyDocumentPromise done");
                resolve();
        });
    });

};

export {
    placeBoxesOnImage, save_boxes_to_server, exportProjectPromise, copyImagePromise, copyDocumentPromise
};