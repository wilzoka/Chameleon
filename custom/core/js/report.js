$(function () {

    CKEDITOR_BASEPATH = '/public/assets/ckeditor/';
    application.functions.getJs([
        '/public/assets/ckeditor/ckeditor.js'
    ]);

    $(document).on('app-loadjs', function () {
        CKEDITOR.replace('html');
    });

});