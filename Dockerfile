####################
# This Dockerfile sets up the local deployment of the TranscriptTool.
####################

# set up Apache PHP server
FROM php:7.4-apache as base

# for development if needed
RUN apt-get update && apt-get install -y vim

# Install zip extension
RUN apt-get update && apt-get install -y \
    libzip-dev \
    && docker-php-ext-install zip

# install and enable gd in PHP for image processing
RUN apt-get update && apt-get install -y \
    libfreetype6-dev \
    libjpeg62-turbo-dev \
    libpng-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j$(nproc) gd

# Install ssh2 extension
RUN apt-get update && apt-get install -y \
    libssh2-1-dev \
    libssh2-1
RUN pecl install ssh2-1.4 && docker-php-ext-enable ssh2

# adjusting the PHP configs to enable the upload of larger and more files
RUN echo "upload_max_filesize = 50M" >> /usr/local/etc/php/php.ini
RUN echo "post_max_size = 300M" >> /usr/local/etc/php/php.ini

# copy over the entire source code
COPY . /var/www/html

# overwrite the default config files with the local deployment config files
COPY ./web/config/config_local.php /var/www/html/web/config/config.php
COPY ./web/config/config_local.js /var/www/html/web/config/config.js    

RUN chown -R www-data:www-data /var/www/

# Install python3 and pip
RUN apt-get install -y python3.9 python3-pip python3-venv wget

# Set up a virtual environment for the CPU image processing
# methods (see them in folder "image_processing_view" and "binarize.py" in the "pre_processing_view" folder)
RUN python3.9 -m venv /opt/TRANSCRIPT-local
RUN /opt/TRANSCRIPT-local/bin/pip install -r /var/www/html/miscellaneous/tr_requirements.txt

# Please note that if you would like to set up a separate GPU server, then you need to do the following steps
# on that server not on your webserver. Additionally, you need to copy the "gpu" folder to the GPU server.

# Download Miniconda
RUN wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O ~/miniconda.sh


# Install Miniconda
RUN bash ~/miniconda.sh -b -p /opt/conda && \
    rm ~/miniconda.sh && \
    ln -s /opt/conda/etc/profile.d/conda.sh /etc/profile.d/conda.sh && \
    echo ". /opt/conda/etc/profile.d/conda.sh" >> ~/.bashrc && \
    echo "conda activate base" >> ~/.bashrc

# Add Conda to PATH
ENV PATH="/opt/conda/bin:${PATH}"


# Install conda environment for the Few-Shot image processing methods (see them in folder "few_shot_train")
# Please be aware that this step might take up to an hour to finish!
RUN conda env create -f /var/www/html/gpu/few_shot_train/htrmatching.yml

# Run the helper script to download the pretrained model
# If you will not use the few-shot image processing methods, then you can comment out this line
RUN /opt/conda/bin/conda run -n TRANSCRIPT-local-few-shot python /var/www/html/gpu/few_shot_train/local_vgg_downloader_helper.py