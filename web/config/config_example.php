<?php

/************************************************************************************************************
 * This file contains the PHP configuration for the environments. Please note that this is
 * an example and you have to add your actual data. Also, you can add or remove environments
 * according to your needs. Recommended environments:
 * - Development: for development on the web server but without connection to the database.
 * - Demo: standalone deployment for demonstration purposes. Also without connection to the database.
 * - Connected Development: for development on the web server with connection to the database. This deployment
 * has the same infrastructural setup as the production environment. One might call this also an end-to-end (E2E)
 * deployment.
 * - Production: the actual production environment.
 * 
************************************************************************************************************/

// TODO: edit paths of ssh keys
// we use these ssh keys to connect to the GPU server, please note that you have to upload the public key to the .ssh folder of the GPU server (Linux)
// we use these variables in "run_gpu_python_code.php"
// we recommend a relative path here so that you could use it for all deployments
$priv_key = "path/to/your/private/key/.ssh/id_rsa";
$pub_key = "path/to/your/public/key/.ssh/id_rsa.pub";
// we use these variables in "index.php", which is one folder level above, so these paths will have one less "../" than the previous ones
$priv_key_index_level = "path/to/your/private/key/.ssh/id_rsa";
$pub_key_index_level = "path/to/your/public/key/.ssh/id_rsa.pub";

// TODO: edit paths of entry points
// all php codes are on the same folder level, we use this variable in most of them (e.g., "run_gpu_python_code.php")
// we recommend a relative path here so that you could use it for all deployments
$USER_PROJECTS_ENTRY_POINT = "path/to/your/user_projects"; // this is the folder where the user projects are stored
// "index.php" uses this variable
// we recommend a relative path here so that you could use it for all deployments
$UPLOADS_ENTRYPOINT = "path/to/your/uploads"; // this is the folder where the database stores the uploaded images

// TODO: edit credentials of GPU server
$ssh_connection_port = 22; // change if necessary
$ssh_connection_user = "your_ssh_user";
$ssh_connection_hostname = "your_gpu_server_host.org";

// TODO: edit database credentials
// please note that it is not recommended to store these credentials in plain text
// you should store them encrypted and decrypt them in the code: this mechanism is not implemented here though
$database_api_login_endpoint = "https://your-database-domain/api/login";
$username_database = "your_username";
$password_database = 'your_password';

// please make sure to set up users and groups on both the web and GPU servers
// we use the following permissions in general for our generated files and folders
umask(017); // removes read-write-execute from other and execute from group
$folder_permission = 0770;
$file_permission = 0660;

// timeout for the Few-shot algorithms
$timeout = 3600; // One hour in seconds

// suffix appended to the end of image processing output file names
$suffix = "_output";

// TODO: edit and uncomment the desired deployment!
// note that you should have a separate virtual environment in python for each different deployment on each machine you use 

// DEVELOPMENT
$project_id = "choose_freely_any_string_for_development";
$deployment = "dev"; // do not change this!
$gpu_server_folder_path = "/absolute/path/to/your/TRANSCRIPT-dev/gpu";
// we use Conda virtual environment, but you can you use a different tool
$PYTHON_INTERPRETER = "/absolute/path/to/your/dev/anaconda3/envs/TRANSCRIPT-dev/bin/python"; // used for binarization, line segmentation, segmentation, Kmeans, and label propagation algorithms
// we recommend Conda here since the Few-shot installation relies on it
$FEW_SHOT_TRAIN_PYTHON_INTERPRETER = "/absolute/path/to/your/dev/anaconda3/envs/TRANSCRIPT-dev-few-shot/bin/python"; // used for Few-shot prediction and fine-tuning
$RUN_GPU_PY_CODE = "run_gpu_python_code.php"; // do not change this!

// DEMO
// $project_id = ""; // just a placeholder, and id gets generated in the code
// $deployment = "demo"; // do not change this!
// $gpu_server_folder_path = "/absolute/path/to/your/TRANSCRIPT-demo/gpu";
// $PYTHON_INTERPRETER = "/absolute/path/to/your/dev/anaconda3/envs/TRANSCRIPT-demo/bin/python"; 
// $FEW_SHOT_TRAIN_PYTHON_INTERPRETER = "/absolute/path/to/your/dev/anaconda3/envs/TRANSCRIPT-dev-few-shot/bin/python";
// $RUN_GPU_PY_CODE = "run_gpu_python_code.php"; // do not change this!

// CONNECTED DEVELOPMENT
// $project_id = ""; // just a placeholder, and id gets generated in the code
// $deployment = "connectdev"; // do not change this!
// $gpu_server_folder_path = "/absolute/path/to/your/TRANSCRIPT-connectdev/gpu";
// $PYTHON_INTERPRETER = "/absolute/path/to/your/dev/anaconda3/envs/TRANSCRIPT-connectdev/bin/python"; 
// $FEW_SHOT_TRAIN_PYTHON_INTERPRETER = "/absolute/path/to/your/dev/anaconda3/envs/TRANSCRIPT-connectdev-few-shot/bin/python";
// $RUN_GPU_PY_CODE = "run_gpu_python_code.php"; // do not change this!

// PRODUCTION
// $project_id = ""; // just a placeholder, and id gets generated in the code
// $deployment = "prod"; // do not change this!
// $gpu_server_folder_path = "/absolute/path/to/your/TRANSCRIPT-prod/gpu";
// $PYTHON_INTERPRETER = "/absolute/path/to/your/dev/anaconda3/envs/TRANSCRIPT-prod/bin/python"; 
// $FEW_SHOT_TRAIN_PYTHON_INTERPRETER = "/absolute/path/to/your/dev/anaconda3/envs/TRANSCRIPT-prod-few-shot/bin/python";
// $RUN_GPU_PY_CODE = "run_gpu_python_code.php"; // do not change this!

?>