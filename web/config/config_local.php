<?php

/************************************************************************************************************
 * This file contains the local PHP configuration for the environments. You do not need to change
 * anything here.
 * 
************************************************************************************************************/

$USER_PROJECTS_ENTRY_POINT = "../../user_projects"; // this is the folder where the user projects are stored

$UPLOADS_ENTRYPOINT = "../images/local_deployment"; // this is the folder where the database stores the uploaded images

// we use the following permissions in general for our generated files and folders
umask(017); // removes read-write-execute from other and execute from group
$folder_permission = 0770;
$file_permission = 0660;

// suffix appended to the end of image processing output file names
$suffix = "_output";

$project_id = "local_deployment"; // you can freely choose any string here
$deployment = "local";
$gpu_server_folder_path = "/var/www/html/gpu";
$PYTHON_INTERPRETER = "/opt/TRANSCRIPT-local/bin/python";
$FEW_SHOT_TRAIN_PYTHON_INTERPRETER = "/opt/conda/envs/TRANSCRIPT-local-few-shot/bin/python";
$RUN_GPU_PY_CODE = "run_gpu_python_code_local.php";


?>