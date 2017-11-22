$(function () {

    var $data = $('input[name="data"]');
    var $formapgto = $('select[name="idformapgto"]');

    if (application.functions.getId() > 0) {
    } else {
        $data.val(moment().format('DD/MM/YYYY'));
    }

});