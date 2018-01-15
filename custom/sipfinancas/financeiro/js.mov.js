$(function () {

    $(document).on('app-datatable', function (e, table) {

        switch (table) {
            case 'tableview87':
                $('button#' + table + '_insert').remove();
                break;
        }

    });

});