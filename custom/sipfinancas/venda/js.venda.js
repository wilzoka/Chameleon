$(function () {

    $(document).on('app-datatable', function (e, table) {


        $('button.btnfilter[data-table="' + table + '"]').remove();

        switch (table) {
            case 'tableview81':// Pagamentos

                $('button#' + table + '_insert').unbind().click(function (e) {
                    application.jsfunction('sipfinancas.financeiro.movparc.__venda_adicionarModal', { id: application.functions.getId() }, function (response) {
                        application.handlers.responseSuccess(response);
                    });
                });

                break;
        }

    });

    $(document).on('app-modal', function (e, modal) {

        switch (modal.id) {
            case 'venda_adicionarModal_modal':
                var $modal = $('#' + modal.id);

                $modal.find('input[name="qtd"], input[name="data"], input[name="dias"]').keydown(function (e) {
                    if (e.keyCode == 13) {
                        $('button#venda_adicionarModal_submit').trigger('click');
                    }
                });

                $('#venda_adicionarModal_submit').click(function () {
                    application.jsfunction('sipfinancas.financeiro.movparc.__venda_adicionar', {
                        idpedido: application.functions.getId()
                        , idcategoria: $modal.find('select[name="idcategoria"]').val()
                        , qtd: $modal.find('input[name="qtd"]').val()
                        , data: $modal.find('input[name="data"]').val()
                        , dias: $modal.find('input[name="dias"]').val()
                    }, function (response) {
                        application.handlers.responseSuccess(response);
                        if (response.success) {
                            $modal.modal('hide');
                        }
                    });
                });

                $('#' + modal.id).on('shown.bs.modal', function () {
                    application.functions.focusFirstElement($(this));
                });

                break;
        }

    });



});