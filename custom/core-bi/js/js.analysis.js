$(function () {
    $pivot = $('#z2').append('<div class="col-sm-12"><div class="pivotdiv"></div></div>').find('.pivotdiv');
    application.functions.getCss([
        '/public/assets/pivotjs/c3.min.css'
        , '/public/assets/pivotjs/pivot.css'
    ]);
    application.functions.getJs([
        '/public/assets/jquery/jquery-ui.min.js'
        , '/public/assets/pivotjs/jquery.ui.touch-punch.min.js'
        , '/public/assets/pivotjs/pivot.js'
        , '/public/assets/pivotjs/pivot.pt.js'
        , '/public/assets/pivotjs/export_renderers.js'
        , '/public/assets/pivotjs/c3.min.js'
        , '/public/assets/pivotjs/c3_renderers.js'
        , '/public/assets/pivotjs/d3.min.js'
        , '/public/assets/pivotjs/d3_renderers.js'
    ]);

    function renderPivot(obj) {
        eval(obj.measures);
        $pivot.pivotUI(
            obj.data
            , $.extend(
                JSON.parse($('textarea[name="config"]').val() || '{}')
                , {
                    renderers: $.extend(
                        $.pivotUtilities.renderers
                        , $.pivotUtilities.c3_renderers
                    )
                    , aggregators: globalaggregator
                    , hiddenAttributes: obj.hiddenAttributes
                    , onRefresh: function (config) {
                        var keys = [
                            'hiddenAttributes'
                            , 'cols'
                            , 'rows'
                            , 'rowOrder'
                            , 'colOrder'
                            , 'exclusions'
                            , 'inclusions'
                            , 'inclusionsInfo'
                            , 'rendererName'
                        ];
                        var config_copy = {};
                        for (var i = 0; i < keys.length; i++) {
                            config_copy[keys[i]] = config[keys[i]];
                        }
                        $('textarea[name="config"]').val(JSON.stringify(config_copy));
                    }
                }
            )
            , true
            , 'pt'
        );
    }

    $(document).on('app-loadjs', function () {

        var $idcube = $('select[name="idcube"]');
        $idcube.on('select2:select', function (e) {
            application.jsfunction('platform.core_bi.js_getCube', { idcube: e.params.data.id }, function (response) {
                if (response.success) {
                    renderPivot(response.data);
                }
            });
        });

        if (application.functions.getId() > 0) {
            application.jsfunction('platform.core_bi.js_getCube', { idcube: $idcube.val() }, function (response) {
                if (response.success) {
                    renderPivot(response.data);
                }
            });
        }

    });
});