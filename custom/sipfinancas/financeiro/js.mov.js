$(function () {

    var af = application.functions;

    if (application.isTableview) {

        function recalcula() {
            var totalgeral = 0.0;
            $('#modalevt').find('input[data-t="Valor"]').each(function () {
                var valor = $(this);
                var juro = $('input[name="juro' + $(this).attr('data-i') + '"');
                var desconto = $('input[name="desconto' + $(this).attr('data-i') + '"');
                var devolucao = $('input[name="devolucao' + $(this).attr('data-i') + '"');
                var total = $('input[name="total' + $(this).attr('data-i') + '"');
                var aberto = $('input[name="aberto' + $(this).attr('data-i') + '"');

                total.val((af.parseFloat(valor.val()) + af.parseFloat(juro.val()) - af.parseFloat(desconto.val()) - af.parseFloat(devolucao.val())).toFixed(2));
                aberto.val((af.parseFloat(valor.attr('data-v')) - af.parseFloat(valor.val())).toFixed(2));

                totalgeral += parseFloat(total.val());
            });
            $('input[name="valortotal"]').val(totalgeral.toFixed(2));
        }

        $(document).on('app-modal', function (e, modal) {
            $('input[data-t="Valor"]').keyup(recalcula);
            $('input[data-t="Juro"]').keyup(recalcula);
            $('input[data-t="Desconto"]').keyup(recalcula);
            $('input[data-t="Devolução"]').keyup(recalcula);
            $('select[name="idcheques"]').change(function () {
                application.jsfunction('sipfinancas.financeiro.mov.js_chequeSoma', {
                    idcheques: $('select[name="idcheques"]').val()
                }, function (response) {
                    if (response.success) {
                        $('input[name="chequetotal"]').val(response.data);
                    }
                });
            });
        });

        $(document).on('click', '#chequeadd', function () {
            application.jsfunction('sipfinancas.financeiro.mov.js_chequeAdd', {
                chequeqtd: $('input[name="chequeqtd"]').val()
                , chequeidcorrentista: $('select[name="chequeidcorrentista"]').val()
                , chequedata: $('input[name="chequedata"]').val()
                , chequevalor: $('input[name="chequevalor"]').val()
            }, function (response) {
                application.handlers.responseSuccess(response);
                if (response.success) {
                    for (var i = 0; i < response.data.length; i++) {
                        var option = new Option(response.data[i].value, response.data[i].id, true, true);
                        $('select[name="idcheques"]').append(option).trigger('change');
                    }
                }
            });
        })
    }

    if (application.isRegisterview) {

        $(document).on('app-datatable', function (e, table) {

            switch (table) {
                case 'tableview87':
                    $('button#' + table + '_insert').remove();
                    break;
            }

        });

    }

});