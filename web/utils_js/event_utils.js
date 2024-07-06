/************************************************************************************************************
 * Util functions for handling events (click or keyboard).

***************************************************************************************************************/

"use strict";

import {
    is_numbering_in_range, siblings, round_float, init_drag, undefinedClusterColorHex
} from './generic_utils.js';

import {
    rainbow, hexToRgb, shuffleArray, AssociateColorsWithClusters
} from './cluster_color_utils.js';

//....................................................FUNCTIONS.............................................................................

/**
 * Adding a box to the UI. Either by cloning (shallow) or by creating one from scratch.
 * @param {Event} event - The default trigger event.
 * @param {Element} boxClone - The box to be cloned and added, if there is any.
 * @param {String} hexColor - Hexadecimal color code.
 * @param {Object} imagePropertiesObject - An object that contains properties of each image. The keys of the
 * object are the image IDs, and the values are objects containing the image properties such as width,
 * height, positionTop, positionLeft, and so on.
 * @param {String} FROM_WHERE_CALLED - Specifies which UI view called the function, e.g., "image_processing" or "post_processing".
 */
function add_box(event, boxClone=null, FROM_WHERE_CALLED="image_processing", imagePropertiesObject=null, hexColor=undefinedClusterColorHex){

    var largest = -1;

    // ! this way of generating a new id is very unstable, changing the id-naming conventions, this could fail
    //create unique id for the new box
    $.each($("div.boxes", ".image_area").get(), function(index, $div_obj) {
        const current_id = $($div_obj).attr("id");
        const current_id_number = parseInt(current_id.slice(current_id.lastIndexOf('_')+1));  //get the last character of every id, which is a number
        if(current_id_number > largest) {
            largest = current_id_number;
        }
    });
    
    largest++;
    largest = "newBox_" + largest;

    if(boxClone !== null){  // clone box if applicable
        let newBox = boxClone.cloneNode(false); //shallow-clone box, i.e. not cloning its children

        const previewElem = boxClone.querySelector(".transcriptionPreview");

        if(previewElem !== null){
            newBox.appendChild(previewElem.cloneNode(true)); //append transcriptionpreview to clone as well
        }
        

        newBox.id = largest;
        newBox.style.left = parseInt(newBox.style.left) + Math.floor(parseInt(newBox.style.width) / 2) + "px";
        newBox.style.top = parseInt(newBox.style.top) + Math.floor(parseInt(newBox.style.height) / 2) + "px";
        document.querySelector(".image_area").appendChild(newBox);

        boxClone.classList.remove("clicked_border");
        init_drag(".clicked_border"); //always need to initialize drag option after changing to new rectangle
        
        
    }
    else{ //create a new element

        let newBox = document.createElement("div");
        newBox.id = largest;
        newBox.className = "boxes draggable_resizable_object clicked_border";
        newBox.dataset.cluster_id = "-2"; // ! hardcoded undefined cluster
        newBox.dataset.transcription = "?";
        newBox.dataset.color = hexColor;
        const boxWidth = 100;
        const boxHeight = 100;
        newBox.style.width = boxWidth + "px";
        newBox.style.height = boxHeight + "px";
        newBox.style.left = Math.max(0, ((($(window).width() - boxWidth) / 2) + $(window).scrollLeft())*(Math.random() * 0.4 + 0.8)) + "px";
        newBox.style.top = Math.max(0, ((($(window).height() - boxHeight) / 2) + $(window).scrollTop())*(Math.random() * 0.4 + 0.8)) + "px";
        const rgbColor = hexToRgb(hexColor);
        const rgbaColor = `rgba(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b}, 0.4)`;
        newBox.style.background = rgbaColor;

        // Possible problem: is the "transcription preview" (post-processing page) currently on? If not, this will still put up the preview on the new box.
        if(FROM_WHERE_CALLED === "post_processing"){
            // add transcription preview right away, as it belongs to the undefined cluster
            let preview = document.createElement('b');
            preview.setAttribute("class", "transcriptionPreview");
            preview.textContent = newBox.dataset.transcription;
            newBox.appendChild(preview);
        }

        let imageProperties = null;

        Object.entries(imagePropertiesObject).forEach(([key, elem]) => {

            const possibleRect = {
            "left": (parseFloat(newBox.style.left) - elem.positionLeft) / elem.width, //- elem.marginLeft 
            "top": (parseFloat(newBox.style.top) - elem.positionTop) / elem.height, //- elem.marginTop
            "width": parseFloat(newBox.style.width) / elem.width,
            "height": parseFloat(newBox.style.height) / elem.height
            };

            
            //leave 10% overhang in width and height
            if(possibleRect.left > 0 && possibleRect.top > 0 && possibleRect.left + possibleRect.width < 1.1 && possibleRect.top+possibleRect.height < 1.1){
                imageProperties = elem;
                newBox.dataset.parent_image = imageProperties["imageFullName"];
            }

        });

        if(imageProperties === null){
            console.log("-----------box is not contained in any image=", newBox);
        }

        document.querySelector(".image_area").appendChild(newBox);

        init_drag(".clicked_border"); //always need to initialize drag option after changing to new rectangle

    }
};


/**
 * Wrapper for adding boxes to the UI. Handles the logic of different situations.
 * @param {Event} event - The default keyup event.
 * @param {String} color - Hexadecimal color code.
 * @param {Object} imagePropertiesObject - An object that contains properties of each image. The keys of the
 * object are the image IDs, and the values are objects containing the image properties such as width,
 * height, positionTop, positionLeft, and so on.
 * @param {String} FROM_WHERE_CALLED - Specifies which UI view called the function, e.g., "image_processing" or "post_processing".
 */
const handleAddingBoxEvent = (event, color, imagePropertiesObject, FROM_WHERE_CALLED) => {

    const allCandidateBoxes = document.querySelectorAll(".clicked_border"); // boxes selected by the user: these are candidates to clone

    if(allCandidateBoxes.length === 0){ // if nothing to clone
        if(color !== null){ // is there color information?
            add_box(event, null, FROM_WHERE_CALLED, imagePropertiesObject, color);
        }
        else{ // if not color given, we use the undefined cluster color
            add_box(event, null, FROM_WHERE_CALLED, imagePropertiesObject);
        }    
        
    }
    else{ // there is something to clone
        const boxToClone = allCandidateBoxes[allCandidateBoxes.length-1]; //we clone the last box of the list
        add_box(event, boxToClone, FROM_WHERE_CALLED);
    }
};

/**
 * Handles keydown events. On DELETE removes the selected boxes from the UI.
 * @param {Event} event - The default keydown event.
 */
function handleKeyDownEvents(event) {

    // do not apply shortcuts if the user is typing in an input field
    if (document.activeElement.tagName === 'INPUT') {
        return; 
    }

    if(event.key === "Delete") { //DELETE key
        document.querySelectorAll(".clicked_border").forEach(elem => elem.remove()); //removes the selected boxes
    }
    else if(event.key === " " || event.key === "Enter") { //ENTER or SPACE key
        event.preventDefault(); // unless we have this ENTER and SPACE will cause havoc
    }
}


/**
 * Handles keyup events. On SPACE adds one box to the UI.
 * @param {Event} event - The default keyup event.
 * @param {String} color - Hexadecimal color code.
 * @param {Object} imagePropertiesObject - An object that contains properties of each image. The keys of the
 * object are the image IDs, and the values are objects containing the image properties such as width,
 * height, positionTop, positionLeft, and so on.
 * @param {String} FROM_WHERE_CALLED - Specifies which UI view called the function, e.g., "image_processing" or "post_processing".
 */
function handleKeyUpEvents(event, color, imagePropertiesObject, FROM_WHERE_CALLED) {
    
    // do not apply shortcuts if the user is typing in an input field
    if (document.activeElement.tagName === 'INPUT') {
        return; 
    }

    if(event.key === " "){ //SPACE key


        handleAddingBoxEvent(event, color, imagePropertiesObject, FROM_WHERE_CALLED);
        
        event.preventDefault(); // unless we have this ENTER and SPACE will cause havoc
    }
    else if(event.key === "Enter"){ //ENTER key
        
        event.preventDefault(); // unless we have this ENTER and SPACE will cause havoc
    }
}

export {
    add_box, handleKeyDownEvents, handleKeyUpEvents,
    handleAddingBoxEvent,
};