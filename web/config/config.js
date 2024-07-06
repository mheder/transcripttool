"use strict";

// TODO: uncomment the desired deployment!

// DEVELOPMENT
const DOMAIN = "https://decrypt.ponens.org/fdev/TRANSCRIPT-dev";
const DB_PROJECT_VIEW = "";

// DEMO
// const DOMAIN = "https://decrypt.ponens.org/fdev/TRANSCRIPT-demo";
// const DB_PROJECT_VIEW = "";

// CONNECTED DEVELOPMENT
// const DOMAIN = "https://decrypt.ponens.org/fdev/TRANSCRIPT-connectdev";
// const DB_PROJECT_VIEW = "https://decrypt.ponens.org/decrypt-web/ProjectList";

// PRODUCTION
// ...

const PROJECT_VIEW_URL = `${DOMAIN}/web`; 
const PRE_PROCESSING_VIEW_URL = `${DOMAIN}/web/pre_processing_view/pre_processing.php`;
const IMAGE_PROCESSING_VIEW_URL = `${DOMAIN}/web/image_processing_view/image_processing.php`;
const POST_PROCESSING_VIEW_URL = `${DOMAIN}/web/post_processing_view/post_processing.php`;

const FLOAT_PRECISION = 3;

export { PROJECT_VIEW_URL, PRE_PROCESSING_VIEW_URL, IMAGE_PROCESSING_VIEW_URL, POST_PROCESSING_VIEW_URL, DOMAIN, FLOAT_PRECISION, DB_PROJECT_VIEW};