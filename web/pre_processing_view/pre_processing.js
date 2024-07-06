/************************************************************************************************************
 * Handles the pre-processing view page. This page is the first page where the user goes when
 * working with original, unedited images. Here the user can rotate, crop, and binarize images.
 * Additionally, the user can also reload the original images and export out the project as a zip file.
 * This page is driven by a state machine, which handles the logic of the page. See more details on
 * this in the code below.
 * 
************************************************************************************************************/

"use strict";

import {
    copyImagePromise, copyDocumentPromise, exportProjectPromise
} from '../utils_js/state_utils.js';

import {   
    PROJECT_VIEW_URL, PRE_PROCESSING_VIEW_URL, IMAGE_PROCESSING_VIEW_URL, POST_PROCESSING_VIEW_URL, DOMAIN
} from '../config/config.js';

/*---------------------------------------------------------GLOBAL VARIABLES----------------------------------------------------------------------------*/

const project_id = send_to_frontend["project_id"]; // identifies the project
const save_id = send_to_frontend["save_id"]; // identifies the save
var listOfImages = send_to_frontend["listOfImages"]; // list of images in the save
var lookup_table = send_to_frontend["lookup_table"]; // lookup table of the save
var currentImageName = listOfImages[0]; // default to first image in the list
var bounding_boxes, transcription_json; // objects storing the save's bounding boxes and transcription data
var curr_rot = 0; // keep track of the current degree of rotation     

const LOAD_JSON_PHP_PATH = send_to_frontend["LOAD_JSON_PHP_PATH"];
const COPY_IMAGE_PHP_PATH = send_to_frontend["COPY_IMAGE_PHP_PATH"];
const FETCH_TRANSCRIPTION_PHP_PATH = send_to_frontend["FETCH_TRANSCRIPTION_PHP_PATH"];

/*---------------------------------------------------------HELPER FUNCTIONS----------------------------------------------------------------------------*/

/**
 * Loads an image and optionally adds a cropping helper rectangle with reference lines.
 * It is used to initialize the cropping/rotating and binarize states.
 * @param {Boolean} is_ref - The `is_ref` parameter in the `init_img_promise` function is a boolean flag that
 * determines whether additional reference lines should be added to the image to assist with cropping
 * and rotating. If `is_ref` is `true`, the function will add reference lines to the image.
 * @param {Boolean} is_rect - The `is_rect` parameter in the `init_img_promise` function is a boolean flag that
 * determines whether a cropping helper rectangle should be displayed on the image. If `is_rect` is
 * `true`, the function will create and display a cropping helper rectangle on the image.
 * @param {String} rel_path_image - Path to the image file to be loaded.
 * @returns {Promise} a Promise.
 */
const init_img_promise = (is_ref, is_rect, rel_path_image) => {
    return new Promise((resolve, reject) => { 
    
        if(document.querySelector(".cropper") !== null){
            document.querySelector(".cropper").remove();
        }
        if(document.querySelector(".b_image") !== null){
            document.querySelector(".b_image").remove();
        }
    
        const d = new Date(); 
        const temp_img_url = `${DOMAIN}/user_projects/${project_id}/${save_id}/${rel_path_image}?${d.getTime()}`; // we never cache image

        if(lookup_table["image_name_mapping"].hasOwnProperty(rel_path_image)){

            document.querySelectorAll(".imageName").forEach(e => e.remove());

            const user_given_name = lookup_table["image_name_mapping"][rel_path_image];
            const imgNameString = user_given_name.slice(0, user_given_name.lastIndexOf('.'));
            let imageName = document.createElement('b');
            imageName.setAttribute("class", "imageName");
            imageName.textContent = imgNameString;
            const imageArea = document.querySelector(".image_area");
            imageArea.appendChild(imageName); 

        }
        
        $("<img>", { "class" : "b_image", "src" : temp_img_url})
            .appendTo(".image_area");
        
        
        $(".b_image").on("load", () => {

            // puts the cropping helper rectangle on the image
            if(is_rect){ 
    
                $("<div />", {"class" : "cropper cropper_border" })
                .appendTo(".image_area");
        
                var $this_div = $(".cropper");
                var crop_l, crop_t, crop_w, crop_h;
                
                
                crop_h = $(".b_image").height() * 0.99;
                crop_w = $(".b_image").width() * 0.99;
                crop_t = ($(".b_image").position().top + parseFloat($(".b_image").css("margin-top"))) * 1.02;
                crop_l = ($(".b_image").position().left + parseFloat($(".b_image").css("margin-left"))) * 1.02;
                
        
                $this_div.css({"left": crop_l + "px", "top": crop_t + "px",
                    "width": crop_w + "px", "height": crop_h + "px"});
        
                // this feature is not used
                // it would add additional reference lines to the image to help with the cropping and rotating
                if(is_ref){ 
        
                    var numberOfRefLines = 3;
        
                    for (let index = 0; index < numberOfRefLines; index++) {
        
                        $("<div />", {"id" : "refLineRight" + index.toString(), "class" : "refLineRight" }).appendTo(".cropper");
                        $("<div />", {"id" : "refLineBottom" + index.toString(), "class" : "refLineBottom" }).appendTo(".cropper");
        
                        $("#refLineRight" + index.toString()).css({"left": index * crop_w / (numberOfRefLines+1) + "px", "top": "0px",
                        "width": crop_w / (numberOfRefLines+1) + "px", "height": crop_h + "px"});
        
                        $("#refLineBottom" + index.toString()).css({"left": "0px", "top": index * crop_h / (numberOfRefLines+1) + "px",
                        "width": crop_w + "px", "height": crop_h / (numberOfRefLines+1) + "px"});
                        
                    }
        
                    $(".cropper").append(`<b id="ref_text">Only for straight line reference</b>`);                               
                    $(".cropper").draggable({           
                    });
        
                }
                else {
        
                    $(".cropper").draggable({      
                    }).resizable({
                        handles: "all",
                        minWidth: 20,
                        minHeight: 20,
                        helper: "ui-resizable-helper",
                        start:function(){
                            $(this).removeClass("cropper_border");
                        },
                        stop:function(){
                            $(this).addClass("cropper_border");
                        }
                    });
        
                }                  
            }

            resolve();
        });
    
    }); 
};

/*----------------------------------------------------STATE TRANSITION FUNCTIONS-----------------------------------------------------------------------*/

/**
 * Initializes the page by setting up the necessary elements and making a server request to load data.
 * @returns {Promise} A promise that resolves when the page initialization is complete.
 */
const initPagePromise = () => {

    console.log("initPagePromise starts");

    document.querySelector("#redirectMainPage").href = `${PROJECT_VIEW_URL}?project_id=${project_id}`;
    document.querySelector("#redirectImageProcPage").href = `${IMAGE_PROCESSING_VIEW_URL}?project_id=${project_id}&save_id=${save_id}`;
    document.querySelector("#redirectEditingPage").href = `${POST_PROCESSING_VIEW_URL}?project_id=${project_id}&save_id=${save_id}`;
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
        
        $("#cropRotDropdownState").addClass("activeBlock");

        console.log("initPagePromise done");
    }).catch(error => {

        console.log(error) 
        functionInitErrorWidget("");

    });
};

/**
 * Initializes the rotating and cropping promise. Loads the image with the cropping helper rectangle.
 * 
 * @returns {Promise} A promise that resolves when the initialization is complete.
 */
const initRotatingCroppingPromise = () => {
    console.log("initRotatingCroppingPromise starts");

    return init_img_promise(false, true, currentImageName).then( () => {

        $(".over_image").addClass("onClickOverImage");
        $("#loadingStateWrapper").addClass("hideElement");
        $("#cropRotStateWrapper").removeClass("hideElement"); 
        console.log("initRotatingCroppingPromise done");

    }).catch(error => {

        console.log(error) 
        functionInitErrorWidget("");

    });
    
};

/**
 * Executes the backend crop and rotation with the current cropping rectangle and rotation degree read
 * from the UI which was set by the user.
 * @returns {Promise} A promise that resolves when the backend operation is completed.
 */
const executeBackendCropRotPromise = () => {
    console.log("executeBackendCropRotPromise starts");

    $(".over_image").removeClass("onClickOverImage");
    $("#loadingStateWrapper").removeClass("hideElement");
    
    const height = $(".b_image").height();
    const width = $(".b_image").width();
    const r_top = $(".b_image").position().top;
    const r_left = $(".b_image").position().left;
    const img_margin = parseFloat($(".b_image").css("margin-left"));
    const img_margin_top = parseFloat($(".b_image").css("margin-top"));
    $(".cropper").show();

    const payloadToServer = {
        "rot": curr_rot,
        "project_id": project_id,
        "save_id": save_id,
        "currentImageName":  currentImageName,
        "left": ($(".cropper").position().left - r_left - img_margin ) / width,
        "top": ($(".cropper").position().top - r_top - img_margin_top) / height,
        "width": ($(".cropper").width()+10) / width, // 2 x border width hardcoded ("+10")
        "height": ($(".cropper").height()+10) / height // 2 x border width hardcoded ("+10")
    };
    
    $(".cropper").remove();

    return fetch("tr_rot_crop_img.php", {
        method: 'POST', 
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payloadToServer)
    }).then(response => {
        return response.json()
    }).then(data => {

        curr_rot = 0;
        console.log("executeBackendCropRotPromise done");

    }).catch(error => {

        console.log(error) 
        functionInitErrorWidget("");

    });

};

/**
 * Clears the rotation and cropping state of the image.
 */
const functionClearRotCrop = () => {

    console.log("functionClearRotCrop starts");
    $("#cropRotStateWrapper").addClass("hideElement"); 
    $(".over_image").removeClass("onClickOverImage");
    $(".cropper").hide(); // cannot be removed yet, because if executerotcrop comes after then it is needed still
    console.log("functionClearRotCrop done");

};

/**
 * Initializes the binarize promise.
 * 
 * @returns {Promise} A promise that resolves when the initialization is complete.
 */
const initBinarizePromise = () => {

    console.log("initBinarizePromise starts");

    return init_img_promise(false, false, currentImageName).then( () => {

        $("#loadingStateWrapper").addClass("hideElement");
        $("#binarizeStateWrapper").removeClass("hideElement"); 
        console.log("initBinarizePromise done");

    }).catch(error => {

        console.log(error) 
        functionInitErrorWidget("");

    });
    
};

/**
 * Executes the backend binarization process on one image by calling a python script
 * with a method selected by the user.
 * 
 * @returns {Promise} A promise that resolves when the binarization process is complete.
 */
const executeBackendBinarizePromise = () => {
    console.log("executeBackendCropRotPromise starts");

    $("#loadingStateWrapper").removeClass("hideElement");

    const selectedBinarizationMethod = $(`input[name="binarizationRadio"]:checked`).val(); // checks user input

    const binarize_data = {
        "selectedBinarizationMethod": selectedBinarizationMethod,
        "project_id": project_id,
        "save_id": save_id,
        "currentImageName": currentImageName
    };

    return fetch("tr_binarize_img.php", {
        method: 'POST', 
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(binarize_data)
    }).then(response => {
        return response.json();
    }).then(data => {

        if(data.hasOwnProperty("return_var") && data["return_var"] === ""){

            console.log("execute python code done");

        }
        else{
            throw "Error in binarization execution";
        }
        
        console.log("executeBackendBinarizePromise done");

    }).catch(error => {

        console.log(error);
        functionInitErrorWidget("");

    });

};

/**
 * Clears the binarize state and hides the binarize state wrapper.
 */
const functionClearBinarize = () => {

    console.log("functionClearBinarize starts");
    $("#binarizeStateWrapper").addClass("hideElement"); 
    console.log("functionClearBinarize done");

};


/**
 * A function that represents a saving promise. This is just here for consistency with other pages.
 * It does not actually save anything.
 * @returns {Promise} A promise that resolves when the saving process is complete.
 */
const savingPromise = () => {

    console.log("savingPromise starts");

    document.querySelector("#loadingStateWrapper").classList.remove("hideElement");

    return new Promise((resolve, reject) => { 

        document.querySelector("#loadingStateWrapper").classList.add("hideElement");
        console.log("savingPromise ends");
        resolve();
    });      

};


/**
 * Wrapper function for exporting a project as a zip file. Please note
 * that here bounding_boxes and transcription_json are only loaded once on page load
 * and never again synchronized!
 * 
 * @returns {Promise} A promise that resolves when the project export is complete.
 */
const exportProjectPromiseWrapper = () => {

    console.log("exportProjectPromiseWrapper starts");

    //clear up UI elements
    $(".stateWrapper").addClass("hideElement"); //hides all stateWrapper UI elements
    $("#loadingStateWrapper").removeClass("hideElement");

    // here bounding_boxes and transcription_json are only loaded once on page load, and never again synchronized!
    return exportProjectPromise(project_id, save_id, lookup_table, bounding_boxes, transcription_json, DOMAIN, FETCH_TRANSCRIPTION_PHP_PATH).then(() => {

        console.log("exportProjectPromiseWrapper done");

    }).catch(error => {

        console.log(error) 
        functionInitErrorWidget("");

    });
};

/**
 * Handles click events for dropdown elements for the entire page.
 * @param {Event} event - The click event object.
 */
function handleClickEvents (event) {

    if(event.target.classList.contains("dropdownSaveElement")){
        
        if(event.target.classList.contains("selectedDropdownSaveElement")){
            event.target.classList.remove("selectedDropdownSaveElement");
        }
        else{
            document.querySelectorAll(".selectedDropdownSaveElement").forEach(e => e.classList.remove("selectedDropdownSaveElement"));
            event.target.classList.add("selectedDropdownSaveElement");
            
        }
    }
}

/**
 * Activates event handlers for the entire page.
 */
const function_activateHandlers = () => {

    if(listOfImages.length !== 1){ //if only one image is loaded in then the page changer UI elements are not activated at all
        document.querySelectorAll(".pageChangeWrapper").forEach(e => e.classList.remove("invisibleElement"));
    }
    else{ //as of now this cannot be reached
        document.querySelectorAll(".pageChangeWrapper").forEach(e => e.classList.add("invisibleElement"));
    }

    document.addEventListener('click', handleClickEvents);

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

const {Machine, interpret, assign} = XState;

/**
 * The webpage is driven by a state machine. Most of the logic is handled by the state machine
 * with a few exceptions (like displaying the image rotation). 
 *
 * @typedef {Object} WebPageMachine
 * @property {Object} states - The states of the machine:
 *      - active: contains the main states which execute the logic of the page.
 *          - hist: functional state that keeps track of the history of the active state, so that we could return to the last "active" state even
 * after entering another state outside of the "active" state, like "reloadOriginalImage" or "globalErrorState".
 *          - imageInit: loads the image and initializes the page. It is a transitional state which only runs once.
 *          - rotating_cropping: handles rotating and cropping the image. Has many sub-states and can transition into many other states.
 *          - binarize: handles binarizing the image. Has many sub-states and can transition into many other states.
 *      - reloadOriginalImage: reloads the current original image from the server. When done returns back through the "hist" state
 * to the last "active" state. This is usually either the "rotating_cropping" or "binarize" state.
 *      - reloadOriginalDocument: reloads all the original images from the server. When done returns back through the "hist" state
 * to the last "active" state. This is usually either the "rotating_cropping" or "binarize" state.
 *      - exportProject: exports the project as a zip file. When done returns back through the "hist" state
 * to the last "active" state. This is usually either the "rotating_cropping" or "binarize" state.
 *      - globalErrorState: handles all the errors that occur in any other state. When done returns back through the "hist" state
 * to the last "active" state. This is usually either the "rotating_cropping" or "binarize" state.
 * @property {Object} actions - The actions are performed on entering or exiting states. See them defined under "entry" or "exit" properties in the states.
 * @property {Object} services - The services are the logic of the states. They are defined as functions that return promises. See them in the "src" properties of the states.
 * Two of them are defined here (copyImagePromise and copyDocumentPromise), but they also call a function.
 */
const webPageMachine = Machine(
    {
    initial: 'active',
    states: {
        active: {
            initial: 'imageInit',
            id: 'active',
            states: {
                hist: {type: 'history', history: 'shallow'},
                imageInit: { 
                    invoke: {
                        src: initPagePromise, 
                        onDone: {target: "rotating_cropping"} //initialState
                    } 
                },
                rotating_cropping: {
                    id: 'rotating_cropping',
                    initial: 'init',
                    on: { ERROREVENT: '#globalErrorState' },
                    states: {
                        init: {
                            invoke: {
                                src: initRotatingCroppingPromise,
                                onDone: 'ready'
                            }
                        },
                        ready: { 
                            entry: ['activateHandlers'],
                            on: {
                                LOAD_SAVE_BUTTON_PRESS: 'saving',
                                CROPPINGROTATINGBUTTONPRESS: 'execute', 
                                PAGECHANGEPRESS: 'init',
                                TRANSITION_TO_BINARIZE: '#binarize',
                                RELOADORIGINALIMAGE: '#reloadOriginalImage',
                                RELOADORIGINALDOCUMENT: '#reloadOriginalDocument',
                                EXPORT_PROJECT_BUTTON_PRESS: {target: '#exportProject'},
                            }, 
                            exit: ['deactivateHandlers', 'clearRotCrop']  
                        },
                        execute: {
                            invoke: {
                                src: executeBackendCropRotPromise,
                                onDone: {target: 'init'}
                            },
                        },
                        saving: {
                            invoke: {
                                src: savingPromise, //this is just a dummy function for consistence with other pages, nothing to save here
                                onDone: {target: 'init'}
                            },
                        }
                    }
                },
                binarize: {
                    id: 'binarize',
                    initial: 'init',
                    on: { ERROREVENT: '#globalErrorState' },
                    states: {
                        init: {
                            invoke: {
                                src: initBinarizePromise,
                                onDone: 'ready'
                            }
                        },
                        ready: { 
                            entry: ['activateHandlers'],
                            on: {
                                LOAD_SAVE_BUTTON_PRESS: 'saving',
                                BINARIZEBUTTONPRESS: 'execute', 
                                PAGECHANGEPRESS: 'init',
                                TRANSITION_TO_CROP_ROT: '#rotating_cropping',
                                RELOADORIGINALIMAGE: '#reloadOriginalImage',
                                RELOADORIGINALDOCUMENT: '#reloadOriginalDocument',
                                EXPORT_PROJECT_BUTTON_PRESS: {target: '#exportProject'},
                            }, 
                            exit: ['deactivateHandlers', 'clearBinarize']  
                        },
                        execute: {
                            invoke: {
                                src: executeBackendBinarizePromise,
                                onDone: {
                                    target: 'init',
                                }, 
                            },
                        },
                        saving: {
                            invoke: {
                                src: savingPromise, //this is not necessarily async, only when creating a new save
                                onDone: {target: 'init'}
                            },
                        }
                    }
                }
            }
        },
        reloadOriginalImage: {
            id: 'reloadOriginalImage',
            invoke: {
                src: "copyImagePromise",
                onDone: 'active.hist'
            }
        },
        reloadOriginalDocument: {
            id: 'reloadOriginalDocument',
            invoke: {
                src: "copyDocumentPromise",
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
        clearRotCrop: (context, event) => {
            console.log("clearRotCrop", context, event);
            functionClearRotCrop();
        },
        clearBinarize: (context, event) => {
            console.log("clearBinarize", context, event);
            functionClearBinarize();
        },
        activateHandlers: () => {
            console.log("activateHandlers");
            function_activateHandlers();
        },
        deactivateHandlers: () => {
            console.log("deactivateHandlers");
            // removes click event listeners so that during state transitions users would not be able to trigger those events
            document.removeEventListener('click', handleClickEvents);
        },
    },
    services: {
        copyImagePromise: (context, event) => {
            console.log("copyImagePromise", context, event);
            document.querySelector("#loadingStateWrapper").classList.remove("hideElement");

            return copyImagePromise(project_id, save_id, currentImageName, COPY_IMAGE_PHP_PATH).then(data => {
                document.querySelector("#loadingStateWrapper").classList.add("hideElement");

            });
        },
        copyDocumentPromise: (context, event) => {
            console.log("copyDocumentPromise", context, event);
            document.querySelector("#loadingStateWrapper").classList.remove("hideElement");

            return copyDocumentPromise(project_id, save_id, COPY_IMAGE_PHP_PATH).then(data => {
                document.querySelector("#loadingStateWrapper").classList.add("hideElement");

            });
        },
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
// See for example the "CROPPINGROTATINGBUTTONPRESS" signal in the "rotating_cropping" state.

    // user clicks to crop and rotate the image: state machine receives signal to transition accordingly
    $("#executeRotCropButton").click( () => {
        console.log("start transition CROPPINGROTATINGBUTTONPRESS");
        webPageService.send('CROPPINGROTATINGBUTTONPRESS');        

    });

    // user clicks to binarize the image: state machine receives signal to transition accordingly
    $("#generateBinarizeButton").click( () => {
        console.log("start transition BINARIZEBUTTONPRESS");
        webPageService.send('BINARIZEBUTTONPRESS');        

    });

    // user clicks to reload the image: state machine receives signal to transition accordingly
    $("#reloadPageButton").click( () => {
        console.log("start transition RELOADORIGINALIMAGE");
        webPageService.send('RELOADORIGINALIMAGE');        

    });

    // user clicks to save the image: state machine receives signal to transition accordingly
    // in this page nothing happens on save, it is a dummy state, just to be consistent with other pages
    $("#saveButton").click( () => {
        console.log("start transition LOAD_SAVE_BUTTON_PRESS");
        webPageService.send('LOAD_SAVE_BUTTON_PRESS');        

    });

    // user clicks to export the project: state machine receives signal to transition accordingly
    $("#exportButton").click( () => {
        console.log("start transition EXPORT_PROJECT_BUTTON_PRESS");
        webPageService.send('EXPORT_PROJECT_BUTTON_PRESS');        

    });


    // user clicks to change to the "rotating_cropping" state: state machine receives signal to transition accordingly
    $(document).on("click", "#cropRotDropdownState", function(){ 

        $(this).siblings('.activeBlock').removeClass("activeBlock");
        $(this).addClass("activeBlock");
        console.log("start transition TRANSITION_TO_CROP_ROT");
        webPageService.send('TRANSITION_TO_CROP_ROT');
                
    }); 

    // user clicks to change to the "binarize" state: state machine receives signal to transition accordingly
    $(document).on("click", "#binarizeDropdownState", function(){ 

        $(this).siblings('.activeBlock').removeClass("activeBlock");
        $(this).addClass("activeBlock");
        //transition state chart into RELOADORIGINALDOCUMENT
        console.log("start transition TRANSITION_TO_BINARIZE");
        webPageService.send('TRANSITION_TO_BINARIZE');
                
    }); 


    document.addEventListener('click', event => {

        //activating pagechanger utility if there is more than one image loaded in
        if(listOfImages.length !== 1){ //if only one image is loaded in then this is not activated at all
            
            // user clicks to reload the entire document (all the images): state machine receives signal to transition accordingly
            if(event.target.id === "reloadDocumentButton"){
                console.log("start transition RELOADORIGINALDOCUMENT");
                webPageService.send('RELOADORIGINALDOCUMENT');   
            }
            // user clicks to change to the previous or next image: state machine receives signal to transition accordingly
            else if(event.target.classList.contains("pageChangeWrapper")){
                $("#loadingStateWrapper").removeClass("hideElement");
                
                const currentNumberOfImages = listOfImages.length;
                let currentImgIndex = listOfImages.indexOf(currentImageName);

                if(event.target.id === "previousPageChanger"){
                    if(currentImgIndex === 0){
                        currentImgIndex = currentNumberOfImages-1;
                    }
                    else{
                        currentImgIndex--;
                    }
                    
                }
                else if(event.target.id === "nextPageChanger"){
                    if(currentImgIndex === currentNumberOfImages-1){
                        currentImgIndex = 0;
                    }
                    else{
                        currentImgIndex++;
                    }
                }
                else{
                    return;
                }

                currentImageName = listOfImages[currentImgIndex];

                curr_rot = 0; //remove any rotation display on page change
                console.log("start transition PAGECHANGEPRESS");
                webPageService.send('PAGECHANGEPRESS');
            }
        }

    });

    // On error widget button click, which means closing the widget, we send a signal to the state machine
    // to transition back to the last active state.
    $(".errorButton").click( () => {
        console.log("start transition ERRORBUTTONPRESS");
        functionExitErrorWidget();
        webPageService.send('ERRORBUTTONPRESS');
    });


    // User clicks to rotate the image: image is rotated in the UI accordingly
    // state machine does not receive a signal here, this is handled outside of the state machine
    $(document).on("click", ".rot_arrow", function(){    

        const id = this.id;
        if(id == "reload"){
            curr_rot = 0;
        }
        else if(id == "left_ninty" || id == "right_ninty"){
            if(id == "left_ninty"){
                curr_rot -= 90; 
            }
            else{
                curr_rot += 90;
            }
        }
        else{
            if(id == "left_small"){
                curr_rot -= 1;
            }
            else{
                curr_rot += 1;
            }
        }
        
        $(".b_image").css({
            "-webkit-transform" : "rotate(" + curr_rot + "deg)",
            "-moz-transform"    : "rotate(" + curr_rot + "deg)",
            "-ms-transform"     : "rotate(" + curr_rot + "deg)",
            "-o-transform"      : "rotate(" + curr_rot + "deg)",
            "transform"         : "rotate(" + curr_rot + "deg)"
        });
        
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