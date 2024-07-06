/************************************************************************************************************
 * Util functions for image handling.

***************************************************************************************************************/

"use strict";

/**
 * Creates and loads all images into the DOM.
 * @param {String} project_id - name of project folder on the server.
 * @param {String} save_id - name of save folder inside the project folder on the server.
 * @param {String} DOMAIN - URL of project root.
 * @param {Object} image_name_mapping - contains the mapping of images paths to user given image names.
 * @return {Promise} returns on resolve().
 */
const initAllImages = (project_id, save_id, DOMAIN, image_name_mapping) => {

    return new Promise((resolve, reject) => { 
        
        console.log("initAllImages starts");

        let selectorLastImage = "";

        const alphabetically_sorted_array = Object.entries(image_name_mapping).sort((a, b) => {
            return a[1].localeCompare(b[1]); // Object.entries(...) returns key/value pairs hence the indexing
        });

        alphabetically_sorted_array.forEach((sorted_value, i) => { 

            const key = sorted_value[0];
            const value = sorted_value[1];
            
            const current_date = new Date();
            const imageURL = `${DOMAIN}/user_projects/${project_id}/${save_id}/${key}`; // to add forced loading, append to the end: ?${current_date.getTime()}

            // User given image name is displayed above each image.
            const imgNameString = value.slice(0, value.lastIndexOf('.'));
            const imgId = `image_${key.slice(0, key.lastIndexOf('.'))}`; //have to cut off the extension of the image, id can't take it
            let imageName = document.createElement('b');
            imageName.setAttribute("class", "imageName");
            imageName.textContent = imgNameString;
            const imageArea = document.querySelector(".image_area");
            imageArea.appendChild(imageName); 

            let newImage = document.createElement("img");
            newImage.id = imgId;
            newImage.className = "b_image invisibleElement";
            newImage.src = imageURL;
            newImage.dataset.full_name = key;

            imageArea.appendChild(newImage); 

            selectorLastImage = imgId;

        });
        
        // Once the last image is loaded, we consider all of them loaded and resolve the promise.
        // ! This is not stable. It is possible that not the last image started to load will be the last to finish loading.
        // Refactoring into a recursive solution could help.
        document.getElementById(selectorLastImage).onload = (event) => {

            resolve();
            
            console.log("initAllImages done");
        };

    }); 
};


/**
 * Retrieves various properties of an image element selected by a
 * given CSS selector string.
 * @param {String} selectorString - this is the CSS selector of the desired image.
 * @return {Object} returns various properties of the selected image.
 */
const queryImageProperties = (selectorString) => {

    const selectedImg = document.querySelector(selectorString);
    const boundingRect = selectedImg.getBoundingClientRect();

    return {
        "height": boundingRect.height,
        "width": boundingRect.width,
        "naturalWidth": selectedImg.naturalWidth,
        "naturalHeight": selectedImg.naturalHeight,
        "positionTop": boundingRect.top, //margin already included!
        "positionLeft": boundingRect.left, //margin already included!
        "imageFullName": selectedImg.dataset.full_name,
        "id": selectedImg.id
    }
    
};

export {
    initAllImages, queryImageProperties
};