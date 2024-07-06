<?php

/************************************************************************************************************
 * Imports a zip file containing the necessary files to recreate a save folder. This is only used in the "project view" page.

***************************************************************************************************************/

require_once '../config/config.php';
require_once '../utils_php/utils.php';

$project_id = $_POST['project_id'];
$projectDir = "$USER_PROJECTS_ENTRY_POINT/$project_id";

$save_id = generate_id("");
$saveDir = "$projectDir/$save_id";

$temp_dir = "$projectDir/" . generate_id("import_temp");
mkdir($temp_dir);
chmod($temp_dir, $folder_permission);

try {

    $user_given_project_name = $_POST["user_given_project_name"];
    $user_given_save_name = $_POST["user_given_save_name"];

    $project_lookup_table = json_decode(file_get_contents("$projectDir/project_lookup_table.json"), true);
    $lookup_table = [];

    if(!isset($_FILES["files"])){
        http_response_code(400);
        $server_error = new Exception("-------sent 400: bad request, no files uploaded.");
        log_error_on_server($projectDir, $server_error);
        exit();
    }  

    $error_to_user = "";
    $logString = "";

    // ! we assume here that we receive only a single file (payloadToServer.append('file', importedFile[0], "import.zip");)
    // no handling of multiple files here, warning is thrown on the frontend.

    $allowed_extensions = ['zip'];

    $allowed_extensions_inside_import = ["jpg", "png", "txt"];

    $zip_file_name = generate_id("imported_zip");
    $file_size = $_FILES['files']["size"][0];
    $file_tmp_loc = $_FILES['files']["tmp_name"][0];
    $ext =  strtolower(pathinfo($zip_file_name, PATHINFO_EXTENSION));


        if($file_size < 50000000) { //max file size ~ 50MB, also defined in project_view.js!
            move_uploaded_file($file_tmp_loc, "$projectDir/$zip_file_name");

            $zip = new ZipArchive();
            $res = $zip -> open("$projectDir/$zip_file_name");
            

            if($res === TRUE) {

                $user_given_file_names = [];

                for ($i = 0; $i < $zip -> numFiles; $i++) {

                    $user_given_file_names[] = $zip -> getNameIndex($i);

                }

                if(in_array("bounding_boxes.json", $user_given_file_names) && in_array("transcription.json", $user_given_file_names)){

                    $zip -> extractTo($temp_dir, "bounding_boxes.json");
                    rename("$temp_dir/bounding_boxes.json", "$temp_dir/". basename("bounding_boxes.json"));

                    $zip -> extractTo($temp_dir, "transcription.json");
                    rename("$temp_dir/transcription.json", "$temp_dir/". basename("transcription.json"));

                    $bounding_boxes_json = json_decode(file_get_contents("$temp_dir/bounding_boxes.json"), true);
                    $transcription_json = json_decode(file_get_contents("$temp_dir/transcription.json"), true);
                    // schema validation for the two json files is not implemented here.

                    $save_image_name_mapping = [];

                    if(array_key_exists("image_name_mapping", $bounding_boxes_json)){

                        $save_image_name_mapping = $bounding_boxes_json["image_name_mapping"];

                        foreach ($bounding_boxes_json["image_name_mapping"] as $img_path => $img_name) {

                            if(!array_key_exists($img_path, $project_lookup_table["image_name_mapping"])){
                                $project_lookup_table["image_name_mapping"][$img_path] = $img_name;
                            }
                        }

                        unset($bounding_boxes_json["image_name_mapping"]);
                    }
                    else{ // Backward compatibility: If there is no available image mapping, then we just take the image paths from the json
                          // both as image paths and names.

                        foreach (array_keys($bounding_boxes_json["documents"]) as $i => $img_path) {

                            $save_image_name_mapping[$img_path] = $img_name;

                            if(!array_key_exists($img_path, $project_lookup_table["image_name_mapping"])){
                                $project_lookup_table["image_name_mapping"][$img_path] = $img_path;
                            }
                        }
                        
                    }

                    
                    // We extract the imported files. We take a whitelisting approach - only letting through the necessary images and json files.
                    // Note that the two required json files we already imported, so here we are dismissing them.
                    foreach ($user_given_file_names as $i => $user_file_name) {

                        $user_file_name_ext = strtolower(pathinfo($user_file_name, PATHINFO_EXTENSION));

                        if(in_array($user_file_name_ext, $allowed_extensions_inside_import)){

                            
                            if($user_file_name_ext === "txt"){

                                $zip -> extractTo($temp_dir, $user_file_name);
                                rename("$temp_dir/$user_file_name", "$temp_dir/". basename($user_file_name));

                            }
                            else if($user_file_name_ext === "jpg" || $user_file_name_ext === "png"){

                                foreach ($save_image_name_mapping as $img_path => $img_name) {

                                    if($user_file_name === $img_name){

                                        $zip -> extractTo($temp_dir, $img_name);
                                        rename("$temp_dir/$img_name", "$temp_dir/". basename($img_path));
                                        
                                        break;
                                    }
                                }
                            }
                            // "else" branch is not handled.
                        }
    
                    }
    
                    $zip -> close();
                    unlink("$projectDir/$zip_file_name");

                    // Check if we have all the images that we need.
                    // ! We assume here that the image paths in the imported zip agree with the ones in bounding_boxes_json["documents"].
                    $list_of_images = array_keys($bounding_boxes_json["documents"]);
                    $missing_images = [];

                    foreach ($list_of_images as $i => $imgName) {

                        if(!is_file("$temp_dir/$imgName")){
                            $missing_images[] = $imgName;
                        }
                    }
                    
                    if(count($missing_images) === 0){

                        // Generate the generated_transcription.json file(s) from the txt files.
                        $generated_transcription = [];
                        $post_processed_transcription = [];

                        foreach ($save_image_name_mapping as $img_path => $img_name) {

                            $generated_txt_path = "$temp_dir/" . pathinfo($img_name, PATHINFO_FILENAME) . ".txt";
                            $post_proc_txt_path = "$temp_dir/" . pathinfo($img_name, PATHINFO_FILENAME) . "_post_processed_transcription.txt";

                            if(is_file($generated_txt_path)){
                                $generated_transcription[$img_path] = file_get_contents($generated_txt_path);
                            }

                            if(is_file($post_proc_txt_path)){
                                $post_processed_transcription[$img_path] = file_get_contents($post_proc_txt_path);
                            }

                        }

                        // ! These two file names are bound to the ones in run_gpu_python_code.php, save_transcription.php, and fetch_transcription.php
                        if(count(array_keys($generated_transcription)) > 0){
                            file_put_contents("$temp_dir/generated_transcription.json", json_encode($generated_transcription));
                        }

                        if(count(array_keys($post_processed_transcription)) > 0){
                            file_put_contents("$temp_dir/post_processed_transcription.json", json_encode($post_processed_transcription));
                        }

                        // Delete the txt files, we do not need them on the server.
                        array_map('unlink', glob("$temp_dir/*.txt"));


                        // Add internal bookkeeping files, and make the final touches.
                        $logString = create_new_log($temp_dir, $user_given_project_name, $user_given_save_name, $file_permission);

                        $save_images = array_map('basename', glob("$temp_dir/*.{jpg,png,jpeg}",  GLOB_BRACE));

                        $lookup_table = create_new_lookup_table(".", $temp_dir, $project_id, $user_given_project_name, $save_id, $user_given_save_name, $save_images, $save_image_name_mapping, $file_permission);

                        rename($temp_dir, $saveDir);

                        foreach (array_map('basename', glob("$saveDir/*")) as $i => $file_name) {
                            chmod("$saveDir/$file_name", $file_permission);
                        }
                        
                    }
                    else{
                        $error_to_user = "Please provide all the images indicated in the bounding_boxes.json inside the imported zip file.";
                    }

                }
                else{
                    $error_to_user = "Please provide both a bounding_boxes.json and transcription.json file inside the imported zip file.";
                }
            }
            else{

                $error_to_user = "Error opening zip file.";
                $server_error = new Exception("-------error opening zip file: $res");
                log_error_on_server($projectDir, $server_error);
            }
        }
        else{
            $error_to_user = "Please upload a zip file smaller than 50MB.";
        }

    // Clean up the temp directory.
    if(is_dir($temp_dir)){
        deleteAllRecursively($temp_dir);
    }

    
    $send_to_frontend = [
        "error_to_user" => $error_to_user,
        "log_body" => $logString,
        "lookup_table" => $lookup_table
    ];
    
    echo json_encode($send_to_frontend);


} catch (Throwable $error_inside_try) {
    log_error_on_server($projectDir, $error_inside_try);
} 

?>
