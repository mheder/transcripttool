<?php

/************************************************************************************************************
 * This is the entry point for the TranscriptTool, it loads the landing page, called "project view". 
 * It sets up the project folder, lookup tables, transfers new images into the project, checks if there
 * are any new results to be transferred from the GPU server, and generates the low resolution thumbnails.
 * Please see the "project_view.js" file for the logic of the "project view page", here we only execute
 * the above mentioned set up tasks.
 * 
***************************************************************************************************************/

require_once 'config/config.php';
require_once 'utils_php/utils.php';

/**
 * We try to retrieve the image names from the database. If this is unsuccessful, then we fall back to using the image paths as image names.
 * 
 * @param list_of_image_ids An array of image IDs that exist in the database.
 * @param projectDir The project directory where the images are stored.
 * @param database_api_login_endpoint The login API endpoint of the database.
 * @param username_database The username for accessing the database.
 * @param password_database the password used to authenticate the
 * user for accessing the database.
 * @param direct_image_list An array of direct image paths. These are the paths to the images that will
 * be used if the image IDs are not provided or if the login is unsuccessful.
 * @param list_of_images An array that will store the image paths and their corresponding names.
 * 
 * @return list_of_images An array that that maps the image paths (keys) to the (user-given) image names (values).
 */
function get_image_ids_from_database($list_of_image_ids, $projectDir, $database_api_login_endpoint, $username_database, 
                                        $password_database, $direct_image_list, $list_of_images){

    if(count($list_of_image_ids) !== 0){

        $curl_handle_login = curl_init();
        curl_setopt($curl_handle_login, CURLOPT_RETURNTRANSFER, true);
    
        curl_setopt($curl_handle_login, CURLOPT_VERBOSE, true);
        $temp_log_file = generate_id("curl_login_error") . ".log";
        $temp_log_file_path = "$projectDir/$temp_log_file";
        $streamVerboseHandle = fopen($temp_log_file_path, 'w+');
        curl_setopt($curl_handle_login, CURLOPT_STDERR, $streamVerboseHandle);
    
        curl_setopt($curl_handle_login, CURLOPT_URL, $database_api_login_endpoint);
        curl_setopt($curl_handle_login, CURLOPT_POST, true);
        curl_setopt($curl_handle_login, CURLOPT_POSTFIELDS, http_build_query(array(
            "username" => $username_database,
            "password" => $password_database, // ! Warning: we recommend to encrypt the password when storing it in the code.
            "securitycode" => "",
            "expire" => "1",
            "permission" => "",
        )));
        curl_setopt($curl_handle_login, CURLOPT_HTTPHEADER, array(
            "Content-Type: application/x-www-form-urlencoded",
        ));
    
        $curl_handle_login_result = curl_exec($curl_handle_login);
    
        $login_token = "";
    
        // If an error occurs, then we do not remove the curl log file.
        if(!$curl_handle_login_result){
            $curl_login_error = file_get_contents($temp_log_file_path);
            error_log("---------PHP CURL LOGIN error trace: $curl_login_error");
        }
        else{
            unlink($temp_log_file_path);
            
            $curl_handle_login_result_decoded = json_decode($curl_handle_login_result, true);
            $login_token = $curl_handle_login_result_decoded["JWT"];
        }
    
        curl_close($curl_handle_login);
    
        if($login_token === ""){
            // login was unsuccessful, falling back to using directly image paths
            foreach ($direct_image_list as $i => $image_path) { 
                $list_of_images[$image_path] = $image_path;
            }
            
        }
        else{
            // login was successful, using the API with image_id-s
    
            $multi_curl_handle_get_images = curl_multi_init();
            $multi_curl_handles = [];
    
            // Build curl handles.
            foreach ($list_of_image_ids as $i => $image_id) { 
    
                $curl_handle_get_images = curl_init();
                curl_setopt($curl_handle_get_images, CURLOPT_RETURNTRANSFER, true);
    
                curl_setopt($curl_handle_get_images, CURLOPT_VERBOSE, true);
                $temp_log_file = generate_id("$i-curl_get_image_error") . ".log";
                $temp_log_file_path = "$projectDir/$temp_log_file";
                $streamVerboseHandle = fopen($temp_log_file_path, 'w+');
    
                curl_setopt($curl_handle_get_images, CURLOPT_STDERR, $streamVerboseHandle);
    
                curl_setopt($curl_handle_get_images, CURLOPT_URL, "https://decrypt.ponens.org/decrypt-web/api/view/images/$image_id");
                curl_setopt($curl_handle_get_images, CURLOPT_CUSTOMREQUEST, 'GET');
                curl_setopt($curl_handle_get_images, CURLOPT_HTTPHEADER, array(
                    "X-Authorization: $login_token",
                ));
                
    
                curl_multi_add_handle($multi_curl_handle_get_images, $curl_handle_get_images);
    
                $multi_curl_handles[] = [
                    "handle" => $curl_handle_get_images,
                    "temp_log_file_path" => $temp_log_file_path,
                    "result" => false
                ];
    
            }
    
            // Execute the multi-handle.
            do {
                curl_multi_exec($multi_curl_handle_get_images, $running);
                curl_multi_select($multi_curl_handle_get_images);
            } while ($running > 0);
    
            // Close handles.
            foreach ($multi_curl_handles as $i => $handle) { 
                curl_multi_remove_handle($multi_curl_handle_get_images, $handle["handle"]);
            }
    
            curl_multi_close($multi_curl_handle_get_images);
    
            // Access the results, log errors.
            $multi_curl_was_there_any_error = false;
    
            foreach ($multi_curl_handles as $i => $handle) { 
                $curl_handle_get_images_result = curl_multi_getcontent($handle["handle"]);
    
                
                if(!$curl_handle_get_images_result){
                    $curl_get_image_error = file_get_contents($handle["temp_log_file_path"]);
                    error_log("---------PHP CURL GET IMG error trace: $curl_get_image_error");
                    $multi_curl_was_there_any_error = true;
                }
                else{
                    unlink($handle["temp_log_file_path"]);
                    $multi_curl_handles[$i]["result"] = json_decode($curl_handle_get_images_result, true);
                }
    
            }
    
            // Process the results.
            if($multi_curl_was_there_any_error){ // If there was any error, then fall back to using the direct image paths.
    
                foreach ($direct_image_list as $i => $image_path) { 
                    $list_of_images[$image_path] = $image_path;
                }
            }
            else{ // If there was no error, then use the image names from the database.
    
                foreach ($multi_curl_handles as $i => $handle) { 
                    $list_of_images[$handle["result"]["images"]["path"]["name"]] = $handle["result"]["images"]["name"];
                }
            }
    
        }
    
    }
    else{
        // If no image id-s were provided, then falling back to using directly image paths.
        // This is always the case in local deployment.
        foreach ($direct_image_list as $i => $image_path) { 
            $list_of_images[$image_path] = $image_path;
        }
    }

    return $list_of_images;
}

/**
 * We contact the GPU server to check if there are any new results to be transferred to this server. Since
 * some image processing (Few-shot) happens on the GPU server and if the connection between the servers breaks, then we need to
 * make sure to still get the results back to this server. This includes: logs which tell the user if the image processing
 * was successful or not, new trained models, and Character error rate (CER) logs.
 * 
 * @param projectDir The directory path where the project files are located.
 * @param ssh_connection_hostname The `ssh_connection_hostname` parameter is the hostname or IP address
 * of the GPU server that you want to connect to.
 * @param ssh_connection_port The `ssh_connection_port` parameter is the port number used for the SSH
 * connection to the GPU server. It specifies the port on which the SSH server is listening for
 * incoming connections.
 * @param ssh_connection_user The `ssh_connection_user` parameter is the username used to authenticate
 * the SSH connection to the GPU server.
 * @param pub_key The `pub_key` parameter is the path to the public key file used for SSH
 * authentication.
 * @param priv_key The `priv_key` parameter is the path to the private key file used for SSH
 * authentication. It is used in the `ssh2_auth_pubkey_file` function to authenticate the SSH
 * connection to the GPU server.
 * @param gpu_server_folder_path The `gpu_server_folder_path` parameter is the path to the folder on
 * the GPU server where the files are stored.
 * @param suffix The "suffix" parameter is a string that will be appended to the file names of the
 * temporary files received from the GPU server. This is done to avoid overwriting any existing files
 * with the same name.
 * @param file_permission The `file_permission` parameter is used to set the permission of the files
 * that are created or modified during the file synchronization process.
 * @param project_id The project ID is a unique identifier for the project. It is used to distinguish
 * between different projects and their associated files and data.
 * @param project_name The name of the project that the files belong to.
 * @param project_lookup_table_path The parameter `project_lookup_table_path` is the file path to the
 * project lookup table JSON file. This file contains information about the project, such as the
 * project ID, project name, image name mapping, and fine-tuned model name mapping.
 * 
 */
function sync_files_from_GPU_server($projectDir, $ssh_connection_hostname, $ssh_connection_port, $ssh_connection_user, $pub_key, $priv_key, $gpu_server_folder_path, $suffix, $file_permission, $project_id, $project_name, $project_lookup_table_path){

    $project_lookup_table = json_decode(file_get_contents("$projectDir/project_lookup_table.json"), true);

    // we filter out the "thumbnails" folder
    $filtered_saves = array_filter(array_map('basename', glob("$projectDir/*",  GLOB_ONLYDIR)), function($v){
        return $v === 'thumbnails' ? false : true;
    });

    // Open an SSH connection in case any files need to be transferred back to this server.
    $connection = ssh2_connect($ssh_connection_hostname, $ssh_connection_port);

    ssh2_auth_pubkey_file(
        $connection,
        $ssh_connection_user,
        $pub_key,
        $priv_key,
        ''
    );

    // Prepare the list of files which will be received through SSH.
    $list_of_files_to_receive = [];
    $list_of_files_to_receive[] = "bounding_boxes.json";
    $list_of_files_to_receive[] = "transcription.json";
    $list_of_files_to_receive[] = "lookup_table.json";
    $list_of_files_to_receive[] = "generated_transcription.json";

    foreach ($filtered_saves as $loopIndex => $dirName) { 

        $logPath = "$projectDir/$dirName/log.txt";

        $log_of_save = "";

        if(file_exists($logPath)){
            $log_of_save = file_get_contents($logPath);
        }

        $lookup_table_path = "$projectDir/$dirName/lookup_table.json";

        $save_images = array_map('basename', glob("$projectDir/$dirName/*.{jpg,png,jpeg}",  GLOB_BRACE));

        if(file_exists($lookup_table_path)){
            $lookup_table = json_decode(file_get_contents($lookup_table_path), true);

            // For backward compatibility
            if(count(array_keys($lookup_table["image_name_mapping"])) === 0){

                foreach ($save_images as $i => $image_path) { 
        
                    if(array_key_exists($image_path, $project_lookup_table["image_name_mapping"])){
                        $lookup_table["image_name_mapping"][$image_path] = $project_lookup_table["image_name_mapping"][$image_path];
                    }
                
                }
        
                file_put_contents($lookup_table_path, json_encode($lookup_table));
                chmod($lookup_table_path, $file_permission);
            }

            if(array_key_exists("GPU_server_result_transmission", $lookup_table)){

                // Check if any data needs to be transferred from the GPU server. This is indicated by a "0" entry for each algorithm.
                if($lookup_table["GPU_server_result_transmission"]["few_shot_recognition"]["finished"] === 0){

                    $tmp_id = generate_id("tmp-$dirName");

                    $session_id = $lookup_table["GPU_server_result_transmission"]["few_shot_recognition"]["session_id"];

                    // We retrieve all the files but as temporary files.
                    foreach ($list_of_files_to_receive as $i => $value) {

                        $path_info = pathinfo($value);
                        $base = $path_info['filename'];
                        $ext = $path_info['extension'];

                        $suffixed_name = $base . $suffix . '.' . $ext;

                        $ret_val = ssh2_scp_recv($connection, "$gpu_server_folder_path/temp/$session_id-$suffixed_name", "$projectDir/$dirName/$tmp_id-$value");

                        // ! No error handling, as it is expected that in some cases files would be missing.
                    }

                    // Check if the result is ready on the GPU server, if yes (indicated by a "1" entry for
                    // the algorithm), then overwrite the regular files with the temporary ones.
                    // Overall, the following changes will be made if: on this server the corresponding entry is "0" and on the GPU server it is "1".
                    $received_lookup_table = json_decode(file_get_contents("$projectDir/$dirName/$tmp_id-lookup_table.json"), true);

                    if($received_lookup_table["GPU_server_result_transmission"]["few_shot_recognition"]["finished"] === 1){

                        foreach ($list_of_files_to_receive as $i => $value) {

                            if($value !== "lookup_table.json"){
                                rename("$projectDir/$dirName/$tmp_id-$value", "$projectDir/$dirName/$value");
                            }
                            
                        }

                        $lookup_table["GPU_server_result_transmission"]["few_shot_recognition"]["finished"] = 1;
                        $lookup_table["GPU_server_result_transmission"]["few_shot_recognition"]["session_id"] = "";
                        file_put_contents($lookup_table_path, json_encode($lookup_table));

                        $log_date = date('Y-m-d H:i:s');
                        $log_of_save .= "$log_date - Few-shot recognition successfully finished, its results transferred from the GPU server.\n";
                        file_put_contents($logPath, $log_of_save);

                    }

                    // Finally, delete the temporary files.
                    unlink("$projectDir/$dirName/$tmp_id-lookup_table.json");

                }

                if($lookup_table["GPU_server_result_transmission"]["few_shot_training"]["finished"] === 0){

                    $tmp_id = generate_id("tmp-$dirName");

                    $session_id = $lookup_table["GPU_server_result_transmission"]["few_shot_training"]["session_id"];
                    $received_lookup_table_path = "$projectDir/$dirName/$tmp_id-lookup_table.json";

                    // We receive only the lookup_table.json
                    $ret_val = ssh2_scp_recv($connection, "$gpu_server_folder_path/temp/$session_id-lookup_table$suffix.json", $received_lookup_table_path);

                    // we only continue if we can successfully transfer the lookup table from the GPU server
                    if($ret_val){

                        // Check if the result is ready on the GPU server, if yes (indicated by a "1" entry for
                        // the algorithm), then overwrite the regular files with the temporary ones.
                        // Overall, the following changes will be made if: on this server the corresponding entry is "0" and on the GPU server it is "1".
                        $received_lookup_table = json_decode(file_get_contents($received_lookup_table_path), true);

                        if($received_lookup_table["GPU_server_result_transmission"]["few_shot_training"]["finished"] === 1){

                            $lookup_table["GPU_server_result_transmission"]["few_shot_training"]["finished"] = 1;
                            $lookup_table["GPU_server_result_transmission"]["few_shot_training"]["session_id"] = "";
                            $lookup_table["GPU_server_result_transmission"]["few_shot_training"]["model_key"] = "";
                            $lookup_table["GPU_server_result_transmission"]["few_shot_training"]["model_name"] = "";
                            file_put_contents($lookup_table_path, json_encode($lookup_table));

                            // Add new model into the project_lookup_table.json
                            $new_model_key = $received_lookup_table["GPU_server_result_transmission"]["few_shot_training"]["model_key"];
                            $new_model_name = $received_lookup_table["GPU_server_result_transmission"]["few_shot_training"]["model_name"];
                            if(!array_key_exists($new_model_key, $project_lookup_table["fine_tuned_model_name_mapping"])){
                                
                                $project_lookup_table["fine_tuned_model_name_mapping"][$new_model_key] = $new_model_name;
                                file_put_contents($project_lookup_table_path, json_encode($project_lookup_table));
                                
                                if (array_key_exists("cer", $received_lookup_table)){
                                    $cer_logs = $received_lookup_table["cer"];
                                    $log_of_save .= "$cer_logs";
                                }

                                $log_date = date('Y-m-d H:i:s');
                                $log_of_save .= "$log_date - Few-shot training successfully finished, its result (access to new model) transferred from the GPU server.\n";
                                file_put_contents($logPath, $log_of_save);
                            }
                            else{

                                if (array_key_exists("cer", $received_lookup_table)){
                                    $cer_logs = $received_lookup_table["cer"];
                                    $log_of_save .= "$cer_logs";
                                }

                                $log_date = date('Y-m-d H:i:s');
                                $log_of_save .= "$log_date - Few-shot training successfully finished.\n";
                                file_put_contents($logPath, $log_of_save);

                            }
                        }

                        // Finally, delete the temporary files.
                        unlink($received_lookup_table_path);
                    }

                }
            }

        }
        else{ // For backward compatibility.

            // Note that the "user_given_save_name" cannot be recovered in this case anymore; we use the save_id instead.
            $lookup_table = create_new_lookup_table("project_view", "$projectDir/$dirName", $project_id, $project_name, $dirName, $dirName, $save_images, $project_lookup_table["image_name_mapping"], $file_permission);
        }
        
    }
}

// ! overwriting a config.php variable
$USER_PROJECTS_ENTRYPOINT = "../user_projects";

$list_of_images = []; // Maps the image paths (keys) to the (user-given) image names (values).
$list_of_image_ids = [];
$direct_image_list = [];
$project_name_from_database = "";

// Initializing a few variables based on the deployment kind
if($deployment === "local"){

    $list_of_images = [
        // you can load in some images here, for example:
        // "IMG_R5_I66_P1.jpg" => "user_given_image_name_1.jpg",
        // "IMG_R5_I67_P2.jpg" => "user_given_image_name_2.jpg",
        // "IMG_R5_I68_P3.jpg" => "user_given_image_name_3.jpg",
        
    ];

}
else if($deployment === "dev"){
    $list_of_images =  [];
    $list_of_image_ids = [];
}
else if($deployment === "connectdev"){
    $list_of_images = [];
    $list_of_image_ids = [];
}
else if($deployment === "prod"){
    $list_of_images = [];
    $list_of_image_ids = [];
}
else{
    throw new Exception("============= Our custom exception: no such deployment: $deployment");
}

//*************************************processing querystring: potential for cyberattack

# We use this path variable to reload the page and to redirect to it from another page (e.g., from the pre-processing view).
if(isset($_GET['project_id'])){
    $project_id = filter_input(INPUT_GET, 'project_id', FILTER_SANITIZE_SPECIAL_CHARS);
}

// We receive this information from the database.
if(isset($_POST['trdata'])){

    $raw_data = filter_input(INPUT_POST, 'trdata', FILTER_SANITIZE_SPECIAL_CHARS);
    $inputArrayFromProject = json_decode(base64_decode($raw_data), true);

    $project_id = $inputArrayFromProject["project_id"];
    $project_name_from_database = $inputArrayFromProject["projectname"]; 

    $direct_image_list = $inputArrayFromProject["images"];
    $list_of_image_ids = $inputArrayFromProject["image_ids"];
    
}

//*************************************processing querystring: potential for cyberattack


if($project_id === ""){ //if no project id, then everything else will fail too, might as well just throw a 404 right away
    http_response_code(404);
    include('utils_php/trtool_404.php');
    die();
}

$projectDir = "$USER_PROJECTS_ENTRYPOINT/$project_id";

$project_lookup_table_path = "$projectDir/project_lookup_table.json";

if(!is_dir($projectDir)){
    mkdir($projectDir);
    chmod($projectDir, $folder_permission);
}

$project_name = "";

if(is_file($project_lookup_table_path)){

    $project_lookup_table = json_decode(file_get_contents($project_lookup_table_path), true);

    //------ to make the new usage of "project_lookup_table" backward compatible
    $any_change = false;
    
    if(array_key_exists("project_name", $project_lookup_table)){
        $project_lookup_table["user_given_project_name"] = $project_lookup_table["project_name"];
        unset($project_lookup_table["project_name"]);
        $any_change = true;
    }

    if(!array_key_exists("fine_tuned_model_name_mapping", $project_lookup_table)){
        $project_lookup_table["fine_tuned_model_name_mapping"] = [];
        $project_lookup_table["image_name_mapping"] = [];
        $any_change = true;
    }

    if($any_change){
        file_put_contents($project_lookup_table_path, json_encode($project_lookup_table));
    }
    //------
    
}
else{
    $project_lookup_table = json_decode(file_get_contents("project_view/template_lookup_table.json"), true);

    $project_lookup_table["project_id"] = $project_id;
    $project_lookup_table["user_given_project_name"] = $project_name_from_database;
    
    file_put_contents($project_lookup_table_path, json_encode($project_lookup_table));
    chmod($project_lookup_table_path, $file_permission);
}

$project_name = $project_lookup_table["user_given_project_name"];


if(isset($_POST['trdata']) && $project_name === "" && $project_name_from_database !== ""){

    $project_lookup_table["user_given_project_name"] = $project_name_from_database;
    
    file_put_contents($project_lookup_table_path, json_encode($project_lookup_table));

}
elseif($project_name === ""){ // as a fallback option, we take the project_id as project_name
    $project_name = $project_id;
}

if(!is_dir("$projectDir/thumbnails")){
    mkdir("$projectDir/thumbnails");
    chmod("$projectDir/thumbnails", $folder_permission);
}

if($deployment !== "local"){
    $list_of_images = get_image_ids_from_database($list_of_image_ids, $projectDir, $database_api_login_endpoint, $username_database, 
                                            $password_database, $direct_image_list, $list_of_images);
}

$listOfProjectImages = array_map("basename", glob("$projectDir/*.{jpg,png,jpeg}",  GLOB_BRACE));

// We transfer the images over from the upload entry point (database or local folder) to the project folder.
if(count(array_keys($list_of_images)) > 0){ // check list of images if there is any new image coming in which should be copied over to the project folder

    foreach ($list_of_images as $image_path => $image_name) { 

        $real_image_path = "$UPLOADS_ENTRYPOINT/$image_path";

        if(is_file($real_image_path) && !in_array($image_path, $listOfProjectImages)){ //if image is not contained in the project folder, then copy it over

            copy($real_image_path, "$projectDir/$image_path");
            chmod("$projectDir/$image_path", $file_permission);

            // Add new image to the mapping in the lookup_table as well.
            $project_lookup_table["image_name_mapping"][$image_path] = $image_name;
        }

        // Backward compatibility to add the missing entries into the project_lookup_table.
        if(!array_key_exists($image_path, $project_lookup_table["image_name_mapping"])){
            
            $project_lookup_table["image_name_mapping"][$image_path] = $image_name;
        }
    }
}

// We contact the GPU server to check if there are any new results to be transferred to this server.
if($deployment !== "local"){

    sync_files_from_GPU_server($projectDir, $ssh_connection_hostname, $ssh_connection_port, $ssh_connection_user,
                                $pub_key_index_level, $priv_key_index_level, $gpu_server_folder_path, $suffix,
                                $file_permission, $project_id, $project_name, $project_lookup_table_path);
}


// We reinitialize this variable, as during the image transfer, new images might have been added to the project folder.
$listOfProjectImages = array_map('basename', glob("$projectDir/*.{jpg,png,jpeg}",  GLOB_BRACE));

// Generate the low resolution thumbnails.
foreach ($listOfProjectImages as $loopIndex => $image_path) { 

    create_thumbnail_image("$projectDir/$image_path", "$projectDir/thumbnails/$image_path", $file_permission);

    // Backward compatibility to add the missing entries into the project_lookup_table.
    // Note however that we don't have the image_name-s for these, so we just enter the image_path instead.
    if(!array_key_exists($image_path, $project_lookup_table["image_name_mapping"])){
        
        $project_lookup_table["image_name_mapping"][$image_path] = $image_path;
    }

}

file_put_contents($project_lookup_table_path, json_encode($project_lookup_table));
chmod($project_lookup_table_path, $file_permission);


//collect the thumbnail images
$listOfProjectThumbnailImages = array_map('basename', glob("$projectDir/thumbnails/*.{jpg,png,jpeg}",  GLOB_BRACE));

$dictOfLogs = [];
$lookup_tables = [];

// We filter out the "thumbnails" folder since it is not a save.
$filtered_saves = array_filter(array_map('basename', glob("$projectDir/*",  GLOB_ONLYDIR)), function($v){
    return $v === 'thumbnails' ? false : true;
});

//Check and collect information of all the existing saves inside the project folder.
foreach ($filtered_saves as $loopIndex => $dirName) { 

    $logPath = "$projectDir/$dirName/log.txt";

    $log_of_save = "";

    if(file_exists($logPath)){
        $log_of_save = file_get_contents($logPath);
    }

    $dictOfLogs[$dirName] = $log_of_save;

    $lookup_table_path = "$projectDir/$dirName/lookup_table.json";

    if(file_exists($lookup_table_path)){
        $lookup_table = json_decode(file_get_contents($lookup_table_path), true);
        $lookup_tables[$dirName] = $lookup_table;
    }
}


$send_to_frontend = [
    "project_id" => $project_id,
    "project_name" => $project_name,
    "project_lookup_tables" => $lookup_tables,
    "project_lookup_table" => $project_lookup_table,
    "dictOfLogs" => $dictOfLogs,
    "thumbnailImageList" => $listOfProjectThumbnailImages,
    "FETCH_TRANSCRIPTION_PHP_PATH" => "utils_php/fetch_transcription.php",
    "LOAD_JSON_PHP_PATH" => "utils_php/load_json.php",
];

$send_to_frontend = json_encode($send_to_frontend);

?>

<!DOCTYPE html>
    <head>
        <title>Project View</title>
        <link rel="icon" type="image/png" href="../images/logo-decode.png">
        <link rel="stylesheet" href="../libs/fontawesome-free-5.15.4-web/css/all.min.css"> <!-- https://fontawesome.com/v5/docs/web/setup/host-font-awesome-yourself -->
        <link rel="stylesheet" href="../libs/jquery-ui-1.12.1/jquery-ui.min.css"> <!-- https://jqueryui.com/download/ -->
        <link rel="stylesheet" href="utils_css/scrollbar.css">
        <link rel="stylesheet" href="utils_css/general_layout.css">
        <link rel="stylesheet" href="project_view/project_view.css">
        <link rel="stylesheet" href="utils_css/functional_classes.css">
        <link rel="stylesheet" href="utils_css/constants.css">

        <script> <?php echo "const send_to_frontend = $send_to_frontend;"; ?> </script> <!-- We send the necessary information to the frontend here. -->
        <script src="../libs/jquery-3.5.1.min.js"></script> <!-- https://jquery.com/download/ -->
        <script src="../libs/jquery-ui-1.12.1/jquery-ui.min.js"></script> <!-- https://jqueryui.com/download/ -->
        <script src="../libs/xstate.js"></script>  <!-- https://xstate.js.org/docs/guides/installation.html -->
        <script src='../libs/FileSaver.js-master/dist/FileSaver.min.js'></script> <!-- https://github.com/eligrey/FileSaver.js -->
        <script src='../libs/jszip-master/dist/jszip.min.js'></script> <!-- https://stuk.github.io/jszip/ -->
        <script type="module" src="project_view/project_view.js"></script>
    </head>
    <body>

        <div class="dialogInputWidget hideElement">
            <div class="dialogInputWidgetHeader">
                <button class="cancel"> x </button>
                <h3 class=""> Create new save </h3>
            </div> 
            <div id="dialogInputWidgetBodyText" class="dialogInputWidgetBody">
                <label class="">New Name</label>
                <input class="" placeholder="enter new name...">
            </div> 
            <div id="dialogInputWidgetBodyZipFile" class="dialogInputWidgetBody hideElement">
                <label class="">Choose a zip file</label>
                <!-- potential cyberattack entrypoint: receiving a zip file -->
                <input class="" type="file" accept=".zip"> 
            </div> 
            <div id="dialogInputWidgetBodyImageFiles" class="dialogInputWidgetBody hideElement">
                <label class="">Select images</label>
                <!-- potential cyberattack entrypoint: receiving files -->
                <input class="" type="file" accept=".jpg,.png" multiple> 
            </div>
            <div class="dialogInputWidgetFooter">
                <button class="cancel"> cancel </button>
                <button id ="execute" class=""> create </button>
            </div> 
        </div> 

        <div class="toolWidget hideElement">
            <i id="deleteButton" class="fas fa-trash toolTipButton"> <span id="deleteButtonToolTip" class="toolTip">delete</span> </i>
            <i id="copyButton" class="fas fa-copy toolTipButton"> <span id="copyButtonToolTip" class="toolTip">copy</span> </i>
            <i id="renameButton" class="fas fa-edit toolTipButton"> <span id="renameButtonToolTip" class="toolTip">rename</span> </i>     
            <i id="exportButton" class="fas fa-file-export toolTipButton"> <span id="exportButtonToolTip" class="toolTip">export project</span> </i> 
        </div>
        <div class="saveWarning hideElement">
            <b class="saveWarningText"> loading... </b>
            <i class="fas fa-spinner fa-spin"></i>         
        </div>
        <header id="header">
            <b id="decryptTitle"> Decrypt </b>
            <div class="overButtonArea">
                <a id="navigationBarBackToProjectView" href=""> <i id="projectButton" class="fas fa-level-up-alt toolTipButton"> <span id="projectButtonToolTip" class="toolTip">back to project view</span> </i> </a>
            </div>
            <b id="pageTitle">  </b>
        </header>

        <div id="areaWrapper" class="">
            <div id="leftArea" class="">
                <b id="createNewSaveButton" class="leftAreaButton"> Create new save </b>
                <b id="importSaveButton" class="leftAreaButton"> Import save </b>
                <b id="uploadImagesButton" class="leftAreaButton"> Upload images </b>
                <div id="imagePreviewArea" class="">
                    <div id="selectDeselectToggle"> <input type="checkbox" class="toggleCheckbox">  <label class="toggleLabel">select/deselect all images</label> </div>
                    <!-- image previews are added here by project_view.js -->
                </div> 
                
            </div> 

            <div id="centerArea" class="">
                <div id="save_table_wrapper" class="">
                    <table id="saveTable">
                        <thead>
                            <tr>
                                <th colspan=2 class="saveTableHeadElement">Save Title</th>
                                <th class="saveTableHeadElement">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                        <!-- save entries are added here by project_view.js -->
                        </tbody>
                    </table>
                </div> 
                <div class="log">

                    <!-- log entries are added here by project_view.js, few examples:
                    <a class="logElement"> 2021.06.03. CET 19.00 - preprocessing session ended </a>  
                    <a class="logElement"> 2021.06.03. CET 19.05 - async image processing started: symbol segmentation on the whole document </a>
                    <a class="logElement"> 2021.06.03. CET 19.31 - async image processing ended: symbol segmentation on the whole document </a>   -->
        
                </div> 
            </div>        
        </div>
    </body>
</html>


