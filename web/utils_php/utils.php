<?php

/************************************************************************************************************
 * Collection of utility functions for the PHP backend.

***************************************************************************************************************/

/**
 * Generates a thumbnail image for a given image, but only if no thumbnail for that image exists.
 *
 * @param String $image_path path of image
 * @param String $thumbnail_path path where the thumbnail will be generated
 * @param Int $file_permission the file permission given to the created files
 * 
 * @throws Exception if image type is not JPEG or PNG
 *
 */
function create_thumbnail_image($image_path, $thumbnail_path, $file_permission){
    $resizeRatio = 10;

    //only create thumbnail if, it doesn't exist yet
    if(!is_file($thumbnail_path)){

        $img_size = getimagesize($image_path);
        $type = $img_size[2];

        if($type == IMAGETYPE_JPEG) {
            $sourceImg = imagecreatefromjpeg($image_path);
        }
        elseif($type == IMAGETYPE_PNG){
            $sourceImg = imagecreatefrompng($image_path);
        }
        else{
            throw new Exception("Error: no such image type: only jpeg and png are supported.");
        }

        $resized_width = round($img_size[0] / $resizeRatio);
        $resized_height = round($img_size[1] / $resizeRatio);

        $resized = imagecreatetruecolor($resized_width, $resized_height);
        imagecopyresampled($resized, $sourceImg, 0, 0, 0, 0, $resized_width, $resized_height, $img_size[0], $img_size[1]);
        imagejpeg($resized, $thumbnail_path, 7);
        chmod($thumbnail_path, $file_permission);

        imagedestroy($sourceImg);
        imagedestroy($resized);
    }
}


/**
 * Deletes all folders and files recursively, from:
 * https://www.geeksforgeeks.org/deleting-all-files-from-a-folder-using-php/
 *
 * @param String $str path of folder
 *
 * @return Bool succes or failure
 *
 */
function deleteAllRecursively($str) {

    // Check for files
    if (is_file($str)) {

        // If it is file then remove by
        // using unlink function
        return unlink($str);
    }

    // If it is a directory.
    elseif (is_dir($str)) {

        // Get the list of the files in this
        // directory
        $scan = glob(rtrim($str, '/').'/*');

        // Loop through the list of files
        foreach($scan as $index=>$path) {

            // Call recursive function
            deleteAllRecursively($path);
        }

        // Remove the directory itself
        return @rmdir($str);
    }
}


/**
 * Generates a unique ID by combining a random hexadecimal value, a prefix, and the
 * current date and time.
 * 
 * @param String $prefix The `prefix` parameter in the `generate_id` function is a string that will be included
 * in the generated session ID. It allows you to add a specific identifier or label to the session ID
 * for better organization or identification purposes.
 * 
 * @return String $sessionID a unique session ID composed of: random hexadecimal value, date, and prefix.

 */
function generate_id($prefix) {

    $sessionID_date = date('Y_m_d_H_i_s');
    $random_id = bin2hex(random_bytes(7));
    $sessionID = "$random_id-$prefix-$sessionID_date";

    return $sessionID;

}


/**
 * Creates a new log file
 *
 * @param String $saveDir path of folder where log file will be created
 * @param String $user_given_project_name the user given project name, which is to be included in the log 
 * @param String $user_given_save_name the user given save name, which is to be included in the log 
 * @param Int $file_permission the file permission given to the created log file
 *
 * @return String the body of the generated log
 */
function create_new_log($saveDir, $user_given_project_name, $user_given_save_name, $file_permission) {

    $logFilePath = "$saveDir/log.txt";
    $currentDate = date('Y-m-d H:i:s');
    $log_body = "$currentDate - Welcome to the logs \n project: $user_given_project_name \n save: $user_given_save_name \n";
    file_put_contents($logFilePath, $log_body);
    chmod($logFilePath, $file_permission);

    return $log_body;

}

/**
 * Creates a new lookup table file
 *
 * @param String $template_dir_path path of folder to the template for the lookup table
 * @param String $saveDir path of folder where lookup table file will be created
 * @param String $project_id generated unique id of project for usage on the server
 * @param String $user_given_project_name the user given project name
 * @param String $save_id generated unique id of save for usage on the server
 * @param String $user_given_save_name the user given save name 
 * @param Array $save_images the paths of the images which are in the save
 * @param Array $image_mapping the image path to name mapping (usually from the project_lookup_table)
 * @param Int $file_permission the file permission given to the created lookup_table
 *
 * @return Object the created lookup table in json
 */
function create_new_lookup_table($template_dir_path, $saveDir, $project_id, $user_given_project_name, $save_id, $user_given_save_name, $save_images, $image_mapping, $file_permission) {

    $lookup_table_path = "$saveDir/lookup_table.json";
    $lookup_table = json_decode(file_get_contents("$template_dir_path/template_lookup_table.json"), true); 
    $lookup_table["project_id"] = $project_id;
    $lookup_table["save_id"] = $save_id;
    $lookup_table["user_given_project_name"] = $user_given_project_name;
    $lookup_table["user_given_save_name"] = $user_given_save_name;

    foreach ($save_images as $i => $image_path) { 

        if(array_key_exists($image_path, $image_mapping)){
            $lookup_table["image_name_mapping"][$image_path] = $image_mapping[$image_path];
        }
    
    }
    
    file_put_contents($lookup_table_path, json_encode($lookup_table));
    chmod($lookup_table_path, $file_permission);

    return $lookup_table;

}


/**
 * Logs PHP errors on the server
 *
 * @since 7.0
 * @param String $save_dir path of folder where log file will be created
 * @param Throwable $thrown_error the error object generated by PHP
 * @param String $sessionID unique ID of the session, we log it for debugging
 *
 * @return Void 
 */
function log_error_on_server($save_dir, $thrown_error, $sessionID = null) {

    if(is_dir($save_dir)){
        $log_path = "$save_dir/error.txt"; 
    }
    else{
        $log_path = "error.txt";
    }
    
    $msg = $thrown_error -> getMessage();
    $currentDate = date('Y-m-d H:i:s');
    $text_into_log = "\n-----------PHP error object-----------\n $currentDate \n--------------------------------------\n $msg";

    if($sessionID !== null){
        $text_into_log .= "\n sessionID: $sessionID";
    }

    error_log($text_into_log);
    error_log($text_into_log, 3, $log_path);

    return ;

}

?>