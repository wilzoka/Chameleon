$(function () {
    $('<div id="divcomplemento" class="col-md-12 hidden"><div class="form-group"><label>Complemento*</label><select name="complemento" style="width:100%;"></div></div>').insertAfter($('select[name="idmotivoparada"]').closest('div.form-group').parent());
    var $idmotivoparada = $('select[name="idmotivoparada"]');

    function trazComplemento(id) {
        $('select[name="complemento"]').find('option').remove();
        application.jsfunction('plastrela.pcp.apparada.js_getComplemento', { id: id, idapparada: application.functions.getId() }, function (response) {
            if (response.success && response.data) {
                var opts = [''].concat(response.data.split(','));
                for (var i = 0; i < opts.length; i++) {
                    $('select[name="complemento"]').append($("<option>").attr('value', opts[i]).text(opts[i]));
                }
                if (response.current) {
                    $('select[name="complemento"]').val(response.current);
                }
                $('#divcomplemento').removeClass('hidden');
            } else {
                $('#divcomplemento').addClass('hidden');
            }
        });
    }

    $idmotivoparada.on('select2:select', function (e) {
        trazComplemento(e.params.data.id);
    });
    $idmotivoparada.on('select2:unselecting', function (e) {
        $('select[name="complemento"]').find('option').remove();
        $('#divcomplemento').addClass('hidden');
    });

    if (application.functions.getId() == 0) {

        application.jsfunction('plastrela.pcp.ap.js_dataUltimoAp', { idoprecurso: application.functions.getUrlParameter('parent') }, function (response) {
            if (response.success) {
                $('input[name="dataini"]').val(response.data);
            }
        });

        application.jsfunction('plastrela.pcp.ap.js_usuarioUltimoAp', {
            idoprecurso: application.functions.getUrlParameter('parent')
        }, function (response) {
            if (response.data.id) {
                var newOption = new Option(response.data.text, response.data.id, false, false);
                $('select[name="iduser"]').append(newOption).trigger('change');
            }
        });

        $('input[name="datafim"]').val(moment().format('DD/MM/YYYY HH:mm'));

        setTimeout(function () {
            $('select[name="idmotivoparada"').focus();
        }, 100);
    } else {
        trazComplemento($idmotivoparada.val());
    }
});