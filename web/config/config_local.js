/************************************************************************************************************
 * This file contains the Javascript configuration for the local environment. You do not need to change
 * anything here.
 * 
************************************************************************************************************/

"use strict";

// LOCAL
const DOMAIN = "http://localhost:8080";
const DB_PROJECT_VIEW = "";

const PROJECT_VIEW_URL = `${DOMAIN}/web`; 
const PRE_PROCESSING_VIEW_URL = `${DOMAIN}/web/pre_processing_view/pre_processing.php`;
const IMAGE_PROCESSING_VIEW_URL = `${DOMAIN}/web/image_processing_view/image_processing.php`;
const POST_PROCESSING_VIEW_URL = `${DOMAIN}/web/post_processing_view/post_processing.php`;

const FLOAT_PRECISION = 3;

export { PROJECT_VIEW_URL, PRE_PROCESSING_VIEW_URL, IMAGE_PROCESSING_VIEW_URL, POST_PROCESSING_VIEW_URL, DOMAIN, FLOAT_PRECISION, DB_PROJECT_VIEW};