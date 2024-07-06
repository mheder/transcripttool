/************************************************************************************************************
 * Generic util functions.

***************************************************************************************************************/

"use strict";

//................................................GLOBAL  CONSTANTS.........................................................................

// ! duplicated in "template_transcription.json"!!!
const undefinedClusterColorHex = "#00d5ff"; //rgba(0, 213, 255, 1)

//....................................................FUNCTIONS.............................................................................

/**
 * Checks if the given number is between the min and max values (excluding the min and max).
 * @param {Number} min - minimum value.
 * @param {Number} number - number to check.
 * @param {Number} max - maximum value.
 * @return {Boolean} returns true if number is within range, otherwise false.
 */
const is_numbering_in_range = (min, number, max) => {
    return min < number && number < max;
};



/**
 * Rounds float to a given number of decimal places.
 * Source: https://learnersbucket.com/examples/javascript/learn-how-to-round-to-2-decimal-places-in-javascript/
 * @param {Number} num - number to be rounded.
 * @param {Number} places - decimal places.
 * @return {Number} returns rounded number.
 */
const round_float = (num, places=2) => {
    const x = Math.pow(10, places);
    return Math.round(num * x) / x;
};


/**
 * Helper function to get all siblings of html element.
 * @param {HTMLElement} elem - any html element.
 * @return {Array} array of sibling html elements.
 */
const siblings = (elem) => {
    // create an empty array
    let siblings = [];

    // if no parent, return empty list
    if (!elem.parentNode) {
        return siblings;
    }

    // first child of the parent node
    let sibling = elem.parentNode.firstElementChild;

    // loop through next siblings until `null`
    do {
        // push sibling to array
        if (sibling != elem) {
            siblings.push(sibling);
        }
    } while (sibling = sibling.nextElementSibling);
		
    return siblings;
};


/**
 * Checks if an element or any of its parent elements have a specific class.
 * @param {HTMLElement} element - The `element` parameter is the HTML element that you want to check for a parent
 * with a specific class.
 * @param {String} className - The `className` parameter is a string that represents the class name you want to
 * check for in the parent elements.
 * @returns {HTMLElement} element - returns either the element that has the specified class
 * name or `false` if no parent element with the class name is found.
 */
const hasParentOfClass = (element, className) => {
    while (element) {
        if (element.classList && element.classList.contains(className)) {
            return element;
        }
        element = element.parentElement;
    }
    return null;
}


/**
 * Initializes draggable and resizable behavior. Written in Jquery.
 * @param {String} selectorString - CSS selector which specifies on which objects to apply the function.
 */
function init_drag(selectorString = ".draggable_resizable_object"){

    $(selectorString).draggable({

    }).resizable({
        handles: "all",
        minWidth: 2,
        minHeight: 2,
        helper: "ui-resizable-helper",
        start:function(event, ui){
            $(this).addClass("no_border");            
        },        
        stop:function(event, ui){
            $(this).removeClass("no_border");            
        }
    });  
};



export {
    is_numbering_in_range, siblings, hasParentOfClass, round_float, init_drag, undefinedClusterColorHex
};