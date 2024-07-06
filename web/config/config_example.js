/************************************************************************************************************
 * This file contains the Javascript configuration for the environments. Please note that this is
 * an example and you have to add your actual domain name. Also, you can add or remove environments
 * according to your needs. Recommended environments:
 * - Development: for development on the web server but without connection to the database.
 * - Demo: standalone deployment for demonstration purposes. Also without connection to the database.
 * - Connected Development: for development on the web server with connection to the database. This deployment
 * has the same infrastructural setup as the production environment. One might call this also an end-to-end (E2E)
 * deployment.
 * - Production: the actual production environment.
 * 
************************************************************************************************************/

"use strict";

// TODO: change the domain and uncomment the desired deployment!

// DEVELOPMENT
const DOMAIN = "https://yourdomain.com/dev";
const DB_PROJECT_VIEW = ""; // not available here since this deployment is not connected to the database

// DEMO
// const DOMAIN = "https://yourdomain.com/demo";
// const DB_PROJECT_VIEW = ""; // not available here since this deployment is not connected to the database

// CONNECTED DEVELOPMENT
// const DOMAIN = "https://yourdomain.com/connect-dev";
// const DB_PROJECT_VIEW = "https://yourconnecteddevdomain.com/decrypt-web/ProjectList";

// PRODUCTION
// const DOMAIN = "https://yourdomain.com/prod";
// const DB_PROJECT_VIEW = "https://yourproddomain.com/decrypt-web/ProjectList";

const PROJECT_VIEW_URL = `${DOMAIN}/web`; 
const PRE_PROCESSING_VIEW_URL = `${DOMAIN}/web/pre_processing_view/pre_processing.php`;
const IMAGE_PROCESSING_VIEW_URL = `${DOMAIN}/web/image_processing_view/image_processing.php`;
const POST_PROCESSING_VIEW_URL = `${DOMAIN}/web/post_processing_view/post_processing.php`;

const FLOAT_PRECISION = 3;

export { PROJECT_VIEW_URL, PRE_PROCESSING_VIEW_URL, IMAGE_PROCESSING_VIEW_URL, POST_PROCESSING_VIEW_URL, DOMAIN, FLOAT_PRECISION, DB_PROJECT_VIEW};