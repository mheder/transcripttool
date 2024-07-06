/************************************************************************************************************
 * Handles the project view page. This page is the main page for the user to manage his project.
 * The user can create, delete, and rename saves, upload images, and export saves inside that project.
 * 
************************************************************************************************************/

"use strict";

import {
    exportProjectPromise
} from '../utils_js/state_utils.js';

import {
    PROJECT_VIEW_URL, PRE_PROCESSING_VIEW_URL, IMAGE_PROCESSING_VIEW_URL, POST_PROCESSING_VIEW_URL, DOMAIN, DB_PROJECT_VIEW
} from '../config/config.js';

/*---------------------------------------------------------GLOBAL VARIABLES----------------------------------------------------------------------------*/
var bounding_boxes, transcription_json;

const project_id = send_to_frontend["project_id"];
const project_name = send_to_frontend["project_name"];
var project_lookup_tables = send_to_frontend["project_lookup_tables"]; // look up tables for the individual saves
var project_lookup_table = send_to_frontend["project_lookup_table"]; // look up table for the entire project
const dictOfLogs = send_to_frontend["dictOfLogs"];

const FETCH_TRANSCRIPTION_PHP_PATH = send_to_frontend["FETCH_TRANSCRIPTION_PHP_PATH"];
const LOAD_JSON_PHP_PATH = send_to_frontend["LOAD_JSON_PHP_PATH"];

/*---------------------------------------------------------HELPER FUNCTIONS----------------------------------------------------------------------------*/


/**
 * Add a new saveRow into the saveTable
 * @param {String} save_id - generated save_id, unique identifier of the save
 * @param {String} save_name - user given name of the save
 * @param {String} logString - log corresponding to the save
 * @param {HTMLElement} saveTableBody - the saveRow will be added into this html element
 */
const addNewSaveRow = (save_id, save_name, logString, saveTableBody) => {

    const saveURLpreProc = `${PRE_PROCESSING_VIEW_URL}?project_id=${project_id}&save_id=${save_id}`;
    const saveURLimageProc = `${IMAGE_PROCESSING_VIEW_URL}?project_id=${project_id}&save_id=${save_id}`;
    const saveURLpostProc = `${POST_PROCESSING_VIEW_URL}?project_id=${project_id}&save_id=${save_id}`;


    const actionMenuString = `<div class="actionSelection" data-save_id=${save_id}>
        <a class="hyperlink actionElement" href=${saveURLpreProc}>
            <i class="fas fa-crop-alt toolTipButton"> </i>
            pre-processing
            <i class="fas fa-crop-alt toolTipButton"> </i>
        </a>                    
        <a class="hyperlink actionElement" href=${saveURLimageProc}>
            <i class="fas fa-images toolTipButton"> </i>
            image processing
            <i class="fas fa-images toolTipButton"> </i>
        </a>
        <a class="hyperlink actionElement" href=${saveURLpostProc}>
            <i class="fas fa-edit toolTipButton"> </i>
            post-processing
            <i class="fas fa-edit toolTipButton"> </i>
        </a>
    </div>`;

    saveTableBody.innerHTML += `<tr id="${save_id}" class="saveRow"> 
                                    <td> <input type="checkbox" class="saveCheckbox" data-save_id=${save_id}> </td>
                                    <td> <b class="actionTitle"> ${save_name} </b> </td>
                                    <td> ${actionMenuString} </td>
                                </tr>`;
    //add the logs to the DOM
    const convertedLogString = logString.replace(/\n/g, '<br>');
    document.querySelector(".log").innerHTML += `<b id="log_${save_id}" class="logElement hideElement"> ${convertedLogString} </b>`;

};

/**
 * Asynchronously loads necessary information and updates the DOM with project
 * data before the page begins to respond to user.
 * @returns {Promise} a Promise.
 */
const initPage = () => {
    return new Promise((resolve, reject) => { 
        console.log("initPage starts");

        document.querySelector("#pageTitle").textContent = `Project: ${project_name}`;

        document.querySelector("#navigationBarBackToProjectView").href = DB_PROJECT_VIEW;

        //load existing save labels into DOM
        const alphabetically_sorted_array = Object.entries(project_lookup_tables).sort(function(a, b) {
            return a[1]["user_given_save_name"].localeCompare(b[1]["user_given_save_name"]); // Object.entries(...) returns key/value pairs hence the indexing
        });


        const saveTableBody = document.querySelector("#saveTable > tbody");

        alphabetically_sorted_array.forEach(value => {

            const key = value[0];

            addNewSaveRow(key, project_lookup_tables[key]["user_given_save_name"], dictOfLogs[key], saveTableBody);

        });

        console.log("initPage done");
        resolve();

        
    });
    
};


/**
 * Creates a thumbnail element with an image, name, and checkbox for each image in the project.
 * Thumbnails are displayed in the left menu.
 * @param {String} image_path_name - The `image_path_name` is the name of the thumbnail-image file on the server.
 * @param {String} user_given_img_name - The `user_given_img_name` parameter in the `addImageThumbnails`
 * function represents the name of the image provided by the user.
 * @param {HTMLElement} imagePreviewArea - The `imagePreviewArea` parameter in the `addImageThumbnails` function
 * represents the HTML element where the image thumbnails will be displayed. This element serves as a
 * container for the dynamically created thumbnail elements that contain the image and related
 * information.
 */
const addImageThumbnails = (image_path_name, user_given_img_name, imagePreviewArea) => {

        const imageURL = `${DOMAIN}/user_projects/${project_id}/thumbnails/${image_path_name}`;

        let thumbnailElement = document.createElement("div");
        thumbnailElement.className = "thumbnailElement";
        thumbnailElement.dataset.image_name = image_path_name;

        const imgId = image_path_name.slice(0, image_path_name.lastIndexOf('.')); //have to cut off the extension of the image, id can't take it
        let imageName = document.createElement('b');
        imageName.setAttribute("class", "thumbnailImageName");
        imageName.textContent = user_given_img_name.slice(0, user_given_img_name.lastIndexOf('.'));
        thumbnailElement.appendChild(imageName); 

        let thumbnailImageWrapper = document.createElement("div");
        thumbnailImageWrapper.className = "thumbnailImageWrapper";

        let thumbnailCheckbox = document.createElement("input");
        thumbnailCheckbox.type = "checkbox";
        thumbnailCheckbox.className = "thumbnailCheckbox";
        thumbnailImageWrapper.appendChild(thumbnailCheckbox); 

        let newImage = document.createElement("img");
        newImage.id = imgId;
        newImage.className = "thumbnailImage";
        newImage.src = imageURL;
        thumbnailImageWrapper.appendChild(newImage); 

        thumbnailElement.appendChild(thumbnailImageWrapper);
        imagePreviewArea.appendChild(thumbnailElement);
    
};


$("document").ready(function(){

    // Not async, just loads the thumbnails in the background

    const imagePreviewArea = document.getElementById("imagePreviewArea");
    // Init thumbnails
    Object.entries(project_lookup_table["image_name_mapping"]).forEach(([key, value], i) => {
        console.log(key, value);
        addImageThumbnails(key, value, imagePreviewArea); 
    });

    console.log("initImageThumbnails done");
    

// Only enable event handling after page has been properly initialized.
    initPage().then(() => {

        document.querySelector(".saveWarning").classList.add("hideElement"); // loading widget off

        // If change is trigged on a save row checkbox, then toolwidget and corresponding logs are displayed
        document.addEventListener("change", function(event) {
            if(event.target.tagName === "INPUT" && event.target.type === "checkbox" && event.target.classList.contains("saveCheckbox")){

                document.getElementById(`log_${event.target.dataset.save_id}`).classList.add("hideElement");
                document.querySelector(".toolWidget").classList.add("hideElement");

                if(event.target.checked){
                    document.querySelectorAll(".logElement").forEach(e => e.classList.add("hideElement"));
                    document.getElementById(`log_${event.target.dataset.save_id}`).classList.remove("hideElement");
                    document.querySelector(".log").scrollTop = document.querySelector(".log").scrollHeight;
                    document.querySelector(".toolWidget").classList.remove("hideElement");
                    document.getElementById("copyButton").classList.remove("hideElement");
                    document.getElementById("renameButton").classList.remove("hideElement");
                    document.getElementById("exportButton").classList.remove("hideElement");

                    if(document.querySelectorAll("input:checked.saveCheckbox").length !== 1){
                        document.getElementById("copyButton").classList.add("hideElement");
                        document.getElementById("renameButton").classList.add("hideElement");
                        document.getElementById("exportButton").classList.add("hideElement");
                    }
                }
                else if(document.querySelectorAll("input:checked.saveCheckbox").length !== 0){

                    document.querySelector(".toolWidget").classList.remove("hideElement");
                    document.getElementById("copyButton").classList.remove("hideElement");
                    document.getElementById("renameButton").classList.remove("hideElement");
                    document.getElementById("exportButton").classList.remove("hideElement");

                    if(document.querySelectorAll("input:checked").length !== 1){
                        document.getElementById("copyButton").classList.add("hideElement");
                        document.getElementById("renameButton").classList.add("hideElement");
                        document.getElementById("exportButton").classList.add("hideElement");
                    }
                }
            }
            
        });

        // We have many different click events: some only style the page, some bring up a dialog window,
        // and some manage the saves on the server.
        document.addEventListener('click', function(event) {

// Styling events
            if(event.target.classList.contains("thumbnailElement")){

                let selectedCheckbox =  event.target.querySelector("input[type='checkbox']");
                
                if(selectedCheckbox.checked){
                    selectedCheckbox.checked = false;
                    event.target.classList.remove("selectedThumbnailElement");
                }
                else{
                    selectedCheckbox.checked = true;
                    event.target.classList.add("selectedThumbnailElement");
                }
            }

            if(event.target.id === "selectDeselectToggle"){

                let selectedCheckbox =  event.target.querySelector("input[type='checkbox']");

                if(selectedCheckbox.checked){
                    selectedCheckbox.checked = false;
                    document.querySelectorAll("input.thumbnailCheckbox").forEach(e => e.checked = false);
                    document.querySelectorAll(".thumbnailElement").forEach(e => e.classList.remove("selectedThumbnailElement"));
                }
                else{
                    selectedCheckbox.checked = true;
                    document.querySelectorAll("input.thumbnailCheckbox").forEach(e => e.checked = true);
                    document.querySelectorAll(".thumbnailElement").forEach(e => e.classList.add("selectedThumbnailElement"));
                }
            }

// Dialog window events
            if(event.target.id === "deleteButton"){
                const dialogWidget = document.querySelector(".dialogInputWidget");
                dialogWidget.classList.remove("hideElement");
                dialogWidget.querySelector("h3").textContent = "Delete selected saves";
                dialogWidget.querySelector("button#execute").textContent = "confirm";

                dialogWidget.querySelector("#dialogInputWidgetBodyText input").classList.add("invisibleElement");
                dialogWidget.querySelector("#dialogInputWidgetBodyText label").classList.add("invisibleElement");
                
            }

            if(event.target.id === "copyButton"){
                const dialogWidget = document.querySelector(".dialogInputWidget");
                dialogWidget.classList.remove("hideElement");
                dialogWidget.querySelector("h3").textContent = "Copy save";
                dialogWidget.querySelector("button#execute").textContent = "copy";
                dialogWidget.querySelector("#dialogInputWidgetBodyText input").classList.remove("invisibleElement");
                dialogWidget.querySelector("#dialogInputWidgetBodyText label").classList.remove("invisibleElement");

            }

            if(event.target.id === "renameButton"){
                const dialogWidget = document.querySelector(".dialogInputWidget");
                dialogWidget.classList.remove("hideElement");
                dialogWidget.querySelector("h3").textContent = "Rename save";
                dialogWidget.querySelector("button#execute").textContent = "rename";
                dialogWidget.querySelector("#dialogInputWidgetBodyText input").classList.remove("invisibleElement");
                dialogWidget.querySelector("#dialogInputWidgetBodyText label").classList.remove("invisibleElement");

            }

            if(event.target.id === 'createNewSaveButton') {
                const dialogWidget = document.querySelector(".dialogInputWidget");
                dialogWidget.classList.remove("hideElement");
                dialogWidget.querySelector("h3").textContent = "Create new save";
                dialogWidget.querySelector("button#execute").textContent = "create";
                dialogWidget.querySelector("#dialogInputWidgetBodyText input").classList.remove("invisibleElement");
                dialogWidget.querySelector("#dialogInputWidgetBodyText label").classList.remove("invisibleElement");
            }

            if(event.target.id === "uploadImagesButton"){
                const dialogWidget = document.querySelector(".dialogInputWidget");
                dialogWidget.classList.remove("hideElement");
                dialogWidget.querySelector("h3").textContent = "Upload images";
                dialogWidget.querySelector("button#execute").textContent = "upload";

                dialogWidget.querySelector("#dialogInputWidgetBodyText input").classList.add("invisibleElement");
                dialogWidget.querySelector("#dialogInputWidgetBodyText label").classList.add("invisibleElement");

                dialogWidget.querySelector("#dialogInputWidgetBodyImageFiles").classList.remove("hideElement");
            }

            if(event.target.id === "importSaveButton"){
                const dialogWidget = document.querySelector(".dialogInputWidget");
                dialogWidget.classList.remove("hideElement");
                dialogWidget.querySelector("h3").textContent = "Import save";
                dialogWidget.querySelector("button#execute").textContent = "import";
                dialogWidget.querySelector("#dialogInputWidgetBodyText input").classList.remove("invisibleElement");
                dialogWidget.querySelector("#dialogInputWidgetBodyText label").classList.remove("invisibleElement");
                dialogWidget.querySelector("#dialogInputWidgetBodyZipFile").classList.remove("hideElement");
            }

            if(event.target.classList.contains("cancel")){
                const dialogWidget = document.querySelector(".dialogInputWidget");  
                dialogWidget.classList.add("hideElement");
                dialogWidget.querySelector("#dialogInputWidgetBodyText input").classList.add("invisibleElement");
                dialogWidget.querySelector("#dialogInputWidgetBodyText label").classList.add("invisibleElement");
                dialogWidget.querySelector("#dialogInputWidgetBodyImageFiles").classList.add("hideElement");
                dialogWidget.querySelector("#dialogInputWidgetBodyZipFile").classList.add("hideElement");

                document.querySelector(".saveWarning").classList.add("hideElement");
            }

// Save management events: here we communicate with the backend
            if(event.target.id === "execute"){ // depending on the dialog window button text, different actions are taken

                const dialogWidget = document.querySelector(".dialogInputWidget");  
                dialogWidget.classList.add("hideElement");

                // Copy an existing save
                if(dialogWidget.querySelector("button#execute").textContent === "copy"){
                    
                    console.log("copy save starts");
                    document.querySelector(".saveWarning").classList.remove("hideElement");
                    document.querySelectorAll(".logElement").forEach(e => e.classList.add("hideElement"));
                    document.querySelector(".toolWidget").classList.add("hideElement");

                    const selected_input = document.querySelectorAll("input:checked.saveCheckbox");

                    if(selected_input.length !== 1){
                        dialogWidget.querySelector("h3").textContent = "Please select exactly one save to copy!";
                        dialogWidget.classList.remove("hideElement");
                        return ;
                    }

                    const save_id = selected_input[0].dataset.save_id; // here we assume that only one save is selected hence the "selected_input[0]"
                    const user_given_new_save_name = document.querySelector(".dialogInputWidget input").value;

                    const array_user_given_save_names = Object.keys(project_lookup_tables).map(key => project_lookup_tables[key]["user_given_save_name"]);
                    
                    if(array_user_given_save_names.includes(user_given_new_save_name)){
                        dialogWidget.querySelector("h3").textContent = "A save with this name already exists, please enter a different name for the copied save!";
                        dialogWidget.classList.remove("hideElement");
                        return ;
                    }
                    
                    const payload_to_server = {
                        "project_id": project_id,
                        "save_id": save_id,
                        "user_given_new_save_name": user_given_new_save_name
                    };
    
                    fetch("project_view/clone_save.php", {
                        method: 'POST', 
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(payload_to_server)
                    }).then(response => {
                        return response.json();
                    }).then(payload_from_server => {
                        
                        console.log("payload_from_server=", payload_from_server);

                        project_lookup_tables[payload_from_server["lookup_table"]["save_id"]] = payload_from_server["lookup_table"];
                        
                        // new save added to the DOM
                        addNewSaveRow(payload_from_server["lookup_table"]["save_id"], user_given_new_save_name,
                            payload_from_server["log_body"], document.querySelector("#saveTable > tbody"));

                        document.querySelector(".saveWarning").classList.add("hideElement");
                        console.log("copy save done");

                    }).catch(error => {
                        console.log(error);
                        
                    });

                }
                // Rename an existing save
                else if(dialogWidget.querySelector("button#execute").textContent === "rename"){

                    console.log("rename starts");
                    document.querySelector(".saveWarning").classList.remove("hideElement");
                    const selected_input = document.querySelectorAll("input:checked.saveCheckbox");

                    if(selected_input.length !== 1){
                        dialogWidget.querySelector("h3").textContent = "Please select exactly one save for renaming!";
                        dialogWidget.classList.remove("hideElement");
                        return ;
                    }

                    const save_id = selected_input[0].dataset.save_id; // here we assume that only one save is selected hence the "selected_input[0]"
                    const user_given_new_save_name = document.querySelector(".dialogInputWidget input").value;
                    const array_user_given_save_names = Object.keys(project_lookup_tables).map(key => project_lookup_tables[key]["user_given_save_name"]);
                    
                    if(array_user_given_save_names.includes(user_given_new_save_name)){
                        dialogWidget.querySelector("h3").textContent = "A save with this name already exists, please enter a different name!";
                        dialogWidget.classList.remove("hideElement");
                        return ;
                    }
                    
                    const payload_to_server = {
                        "project_id": project_id,
                        "save_id": save_id,
                        "user_given_new_save_name": user_given_new_save_name
                    };

                    fetch("project_view/rename_save.php", {
                        method: 'POST', 
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(payload_to_server)
                    }).then(response => {
                        return response.json();
                    }).then(payload_from_server => {
                        
                        console.log("payload_from_server=", payload_from_server);

                        project_lookup_tables[save_id] = payload_from_server["lookup_table"];

                        let saveRow = document.getElementById(save_id);
                        saveRow.querySelector("b.actionTitle").textContent = user_given_new_save_name;
                        document.getElementById(`log_${save_id}`).innerHTML = payload_from_server["log_body"].replace(/\n/g, '<br>'); // log adjusted
                        document.querySelector(".saveWarning").classList.add("hideElement");
        
                        console.log("rename done");

                    }).catch(error => {
                        console.log(error);
                    });
                    
                }
                // Delete selected saves
                else if(dialogWidget.querySelector("button#execute").textContent === "confirm"){

                    console.log("remove_save starts");
                    document.querySelector(".saveWarning").classList.remove("hideElement");
                    document.querySelectorAll(".logElement").forEach(e => e.classList.add("hideElement"));
                    document.querySelector(".toolWidget").classList.add("hideElement");
                    
                    let save_id_array = [];
                    document.querySelectorAll("td > input:checked").forEach(e => {
                        save_id_array.push(e.dataset.save_id);
                        document.getElementById(e.dataset.save_id).remove();
                    });

                    const payloadToServer = {
                        "project_id": project_id,
                        "save_id_array": save_id_array
                    };

                    fetch("project_view/remove_save.php", {
                        method: 'POST', 
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(payloadToServer)
                    }).then(response => {
                        return response.json();
                    }).then(data => {

                        Object.keys(project_lookup_tables).forEach(key => {
                            if(save_id_array.includes(key)){
                                delete project_lookup_tables[key];
                            }
                            
                        });

                        console.log("remove_save=", data);
                        document.querySelector(".saveWarning").classList.add("hideElement");        
                        console.log("remove_save done");
                        
                    }).catch(error => {
                        console.log(error);
                    });
                    
                }
                // Create a new save from the selected images
                else if(dialogWidget.querySelector("button#execute").textContent === "create"){

                    console.log("create save starts");
                    document.querySelector(".saveWarning").classList.remove("hideElement");

                    const user_given_save_name = document.querySelector(".dialogInputWidget input").value;

                    const array_user_given_save_names = Object.keys(project_lookup_tables).map(key => project_lookup_tables[key]["user_given_save_name"]);
                    
                    if(array_user_given_save_names.includes(user_given_save_name)){
                        dialogWidget.querySelector("h3").textContent = "A save with this name already exists, please enter a different name!";
                        dialogWidget.classList.remove("hideElement");
                        return ;
                    }

                    const selectedImages = [...document.querySelectorAll(".selectedThumbnailElement")].map(e => e.dataset.image_name);

                    if(selectedImages.length < 1){
                        dialogWidget.querySelector("h3").textContent = "Please select at least one image to create a new save!";
                        dialogWidget.classList.remove("hideElement");
                        return ;
                    }

                    //remove thumbnail selection
                    document.querySelectorAll("input.thumbnailCheckbox").forEach(e => e.checked = false);
                    document.querySelectorAll(".thumbnailElement").forEach(e => e.classList.remove("selectedThumbnailElement"));
                    
                    const payload_to_server = {
                        "project_id": project_id,
                        "user_given_project_name": project_name,
                        "user_given_save_name": user_given_save_name,
                        "selectedImages": selectedImages
                    };
    
                    fetch("project_view/create_new_save.php", {
                        method: 'POST', 
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(payload_to_server)
                    }).then(response => {
                        return response.json();
                    }).then(payload_from_server => {
                        
                        console.log("payload_from_server = ", payload_from_server);

                        project_lookup_tables[payload_from_server["lookup_table"]["save_id"]] = payload_from_server["lookup_table"];

                        // add new save to the DOM
                        addNewSaveRow(payload_from_server["lookup_table"]["save_id"], user_given_save_name,
                            payload_from_server["log_body"], document.querySelector("#saveTable > tbody"));

                        document.querySelector(".saveWarning").classList.add("hideElement");
        
                        console.log("create save done");

                    }).catch(error => {
                        console.log(error); 
                    });
                }
                // Import an existing save from the user's machine as a zip file
                else if(dialogWidget.querySelector("button#execute").textContent === "import"){

                    console.log("import save starts");
                    document.querySelector(".saveWarning").classList.remove("hideElement");

                    const importedFile = document.querySelector("#dialogInputWidgetBodyZipFile input").files;

                    console.log(importedFile);

                    if(importedFile.length !== 1){
                        dialogWidget.querySelector("h3").textContent = "Please upload a single file!";
                        dialogWidget.classList.remove("hideElement");
                        return ;
                    }

                    // we assume from here that there is only one file
                    if(!importedFile[0]["name"].includes(".zip") || importedFile[0]["size"] > 50000000){ //size (50 MB) is also defined in import_save.php!
                        dialogWidget.querySelector("h3").textContent = "Please only try to upload zip files which are under 50MB";
                        dialogWidget.classList.remove("hideElement");
                        return;
                    }

                    const user_given_save_name = document.querySelector(".dialogInputWidget input").value;

                    const array_user_given_save_names = Object.keys(project_lookup_tables).map(key => project_lookup_tables[key]["user_given_save_name"]);
                    
                    if(array_user_given_save_names.includes(user_given_save_name)){
                        dialogWidget.querySelector("h3").textContent = "A save with this name already exists, please enter a different name!";
                        dialogWidget.classList.remove("hideElement");
                        return ;
                    }

                    let payloadToServer = new FormData();
                    payloadToServer.append('files[]', importedFile[0], "import.zip");
                    payloadToServer.append('project_id', project_id);
                    payloadToServer.append('user_given_save_name', user_given_save_name);
                    payloadToServer.append('user_given_project_name', project_name);
                    
    
                    fetch("project_view/import_save.php", {
                        method: 'POST', 
                        body: payloadToServer
                    }).then(response => {
                        return response.json();
                    }).then(payload_from_server => {

                        console.log("payload_from_server=", payload_from_server);

                        if(payload_from_server["error_to_user"] !== ""){
                            dialogWidget.querySelector("h3").textContent = payload_from_server["error_to_user"];
                            dialogWidget.classList.remove("hideElement");
                            // not throwing error here
                        }
                        else{

                            project_lookup_tables[payload_from_server["lookup_table"]["save_id"]] = payload_from_server["lookup_table"];

                            // add new save to the DOM
                            addNewSaveRow(payload_from_server["lookup_table"]["save_id"], user_given_save_name,
                                                payload_from_server["log_body"], document.querySelector("#saveTable > tbody"));

                            dialogWidget.querySelector("#dialogInputWidgetBodyZipFile").classList.add("hideElement");
                            dialogWidget.querySelector("#dialogInputWidgetBodyText").classList.remove("hideElement");
            
                            console.log("import save done");

                        }

                        document.querySelector(".saveWarning").classList.add("hideElement");
                        
                    }).catch(error => {
                        console.log(error);
                    });
                }
                // Upload images from the user's machine into the project
                else if(dialogWidget.querySelector("button#execute").textContent === "upload"){

                    const uploadedImages = Array.from(document.querySelector("#dialogInputWidgetBodyImageFiles input").files);

                    if(uploadedImages.length === 0){
                        dialogWidget.querySelector("h3").textContent = "Please select at least one image!";
                        dialogWidget.classList.remove("hideElement");
                        return ;
                    }

                    // check if the files are images and under 50MB
                    const allowedExtensions = /(\.jpg|\.png)$/i;
                    let isError = false;
                    uploadedImages.forEach(e => {
                        if(!allowedExtensions.exec(e["name"]) || e["size"] > 50000000){ // the size (50 MB) is also defined in upload_images.php!
                            dialogWidget.querySelector("h3").textContent = "Please only try to upload images (png or jpg) under 50MB";
                            isError = true;
                        }
                    });
                    if(isError){
                        dialogWidget.classList.remove("hideElement");
                        return;
                    }

                    console.log(uploadedImages);

                    console.log("upload images starts");
                    document.querySelector(".saveWarning").classList.remove("hideElement");

                    let formToServer = new FormData();
                    uploadedImages.forEach(e => formToServer.append('files[]', e)); // 'files[]' is specifically there for PHP
                    formToServer.append('project_id', project_id);

                    for (var value of formToServer.values()) {
                        console.log(value); 
                    }
    
                    fetch("project_view/upload_images.php", {
                        method: 'POST', 
                        body: formToServer
                    }).then(response => {
                        return response.json();
                    }).then(data => {
                        
                        console.log("data=", data);
                        const newImageNames = data["image_names"];
                        project_lookup_table = data["project_lookup_table"];

                        // add the thumbnails into the DOM for the new images
                        const imagePreviewArea = document.getElementById("imagePreviewArea");
                        Object.entries(newImageNames).forEach(([key, value], i) => addImageThumbnails(key, value, imagePreviewArea));

                        document.querySelector(".saveWarning").classList.add("hideElement");

                        dialogWidget.querySelector("#dialogInputWidgetBodyImageFiles").classList.add("hideElement");
                        dialogWidget.querySelector("#dialogInputWidgetBodyText").classList.remove("hideElement");

                        console.log("upload images done");

                    }).catch(error => {
                        console.log(error);
                    });
                }
            }

            // Export a save as a zip file to the user's machine
            if(event.target.id === "exportButton"){

                console.log("exportButton starts");
                document.querySelector(".saveWarning").classList.remove("hideElement");

                const selected_input = document.querySelectorAll("input:checked.saveCheckbox");

                if(selected_input.length !== 1){
                    dialogWidget.querySelector("h3").textContent = "Please select exactly one save to export!";
                    dialogWidget.classList.remove("hideElement");
                    return ;
                }
                
                const save_id = selected_input[0].dataset.save_id; // here we assume that only one save is selected hence the "selected_input[0]"
                
                const payloadToServer = {
                    "project_id": project_id,
                    "save_id": save_id
                };

                fetch(LOAD_JSON_PHP_PATH, {
                    method: 'POST', 
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payloadToServer)
                }).then(response => {
                    return response.json();
                }).then(payload_from_server => {

                    console.log("payload_from_server = ", payload_from_server);
                    
                    bounding_boxes = payload_from_server["bounding_boxes"];
                    transcription_json = payload_from_server["transcription"];

                    return exportProjectPromise(project_id, save_id, project_lookup_tables[save_id], bounding_boxes, transcription_json, DOMAIN, FETCH_TRANSCRIPTION_PHP_PATH);
                }).then(() => {

                    document.querySelector(".saveWarning").classList.add("hideElement");
                    console.log("exportProjectPromiseWrapper done");
                }).catch(error => {
                    console.log(error);
                });
            }

        });

    });

});