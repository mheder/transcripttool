<?php

/************************************************************************************************************
 * Uploads images to the project folder and creates thumbnails for them. Also updates the project_lookup_table.
 * Used in the "project_view" page.

***************************************************************************************************************/

require_once '../utils_php/utils.php';
require_once '../config/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !isset($_POST["project_id"])) {
    http_response_code(400);
    error_log("---------- Our custom exception: bad request, not a POST request or project_id not set.");
    exit();
}

$project_id = $_POST["project_id"];

$projectDir = "$USER_PROJECTS_ENTRY_POINT/$project_id";

if(!is_dir($projectDir)){
    http_response_code(400);
    $server_error = new Exception("-------sent 400: bad request, projectDir does not exist: $projectDir");
    log_error_on_server($projectDir, $server_error);
    exit();
}

try {
    if(!isset($_FILES["files"])){
        http_response_code(400);
        $server_error = new Exception("-------sent 400: bad request, no files uploaded.");
        log_error_on_server($projectDir, $server_error);
        exit();
    }    

    // open project_lookup_table to add the uploaded images to it
    $project_lookup_table_path = "$projectDir/project_lookup_table.json";
    $project_lookup_table = json_decode(file_get_contents($project_lookup_table_path), true);

    $allowed_extensions = ['jpg', 'png'];

    $image_names = [];
    $errors_to_frontend = [];

    $number_of_files = count($_FILES['files']['tmp_name']);

    for ($i = 0; $i < $number_of_files; $i++) {

        $user_given_img_name = $_FILES['files']["name"][$i]; 
        $ext =  strtolower(pathinfo($user_given_img_name, PATHINFO_EXTENSION));
        $generated_img_name = generate_id("uploaded-$i") . ".$ext";
        $img_size = $_FILES['files']["size"][$i];
        $img_tmp_loc = $_FILES['files']["tmp_name"][$i];
        
        if(in_array($ext, $allowed_extensions) && $img_size < 50000000) { //max file size ~ 50MB, also defined in project_view.js!
            move_uploaded_file($img_tmp_loc, "$projectDir/$generated_img_name");
            chmod("$projectDir/$generated_img_name", $file_permission);
            $image_names[$generated_img_name] = $user_given_img_name;
            create_thumbnail_image("$projectDir/$generated_img_name", "$projectDir/thumbnails/$generated_img_name", $file_permission); // generate thumbnail image

            $project_lookup_table["image_name_mapping"][$generated_img_name] = $user_given_img_name;
        }
        else{
            $errors_to_frontend[] = $generated_img_name;
        }
    }

    file_put_contents($project_lookup_table_path, json_encode($project_lookup_table));
    chmod($project_lookup_table_path, $file_permission);

    $send_to_frontend = [
        "errors_to_frontend" => $errors_to_frontend,
        "image_names" => $image_names,
        "project_lookup_table" => $project_lookup_table
    ];
    
    echo json_encode($send_to_frontend);

} catch (Throwable $error_inside_try) {
    log_error_on_server($projectDir, $error_inside_try);
} 

?>
