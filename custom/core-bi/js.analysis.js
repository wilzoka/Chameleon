$(function () {
    $pivot = $('#z2').append('<div class="col-sm-12"><div class="pivotdiv"></div></div>').find('.pivotdiv');

    application.functions.getCss([
        '/public/assets/pivotjs/c3.min.css'
        , '/public/assets/pivotjs/pivot.css'
    ]);
    application.functions.getJs([
        'https://cdnjs.cloudflare.com/ajax/libs/jqueryui/1.11.4/jquery-ui.min.js'
        , '/public/assets/pivotjs/pivot.js'
        , '/public/assets/pivotjs/pivot.pt.js'
        , '/public/assets/pivotjs/export_renderers.min.js'
        , '/public/assets/pivotjs/c3.min.js'
        , '/public/assets/pivotjs/c3_renderers.min.js'
        , '/public/assets/pivotjs/d3.min.js'
        , '/public/assets/pivotjs/d3_renderers.min.js'
    ]);

    $(document).on('app-loadjs', function () {


        var $idcube = $('select[name="idcube"]');



        if (application.functions.getId() == 0) {

            $idcube.on('select2:select', function (e) {
                application.jsfunction('platform.bi.js_getCube', { idcube: e.params.data.id }, function (response) {
                    eval(response.data.measures);
                    $pivot.pivotUI(response.data.data
                        , {
                            renderers: $.extend(
                                $.pivotUtilities.renderers,
                                $.pivotUtilities.c3_renderers
                            ),
                            aggregators: globalaggregator,
                            hiddenAttributes: response.data.hiddenAttributes
                        });
                });
            });

        } else {
            $idcube.attr('disabled', true);
        }
    });
});