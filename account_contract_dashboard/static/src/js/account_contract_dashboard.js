odoo.define('account_contract_dashboard.dashboard', function (require) {
'use strict';

var ActionManager = require('web.ActionManager');
var ajax = require('web.ajax');
var ControlPanelMixin = require('web.ControlPanelMixin');
var core = require('web.core');
var Model = require('web.Model');
var utils = require('web.utils');
var Widget = require('web.Widget');

var _t = core._t;
var QWeb = core.qweb;


/*

ABOUT

In this module, you'll find two main widgets : one that represents the Revenue KPIs dashboard
and one that represents the salesman dashboard.

In both of them, there are two steps of rendering : one that renders the main template that leaves
empty sections for the rendering of the second step. This second step can take some time to be rendered
because of the calculation and is then rendered separately.

*/


// Abstract widget with common methods
var account_contract_dashboard_abstract = Widget.extend(ControlPanelMixin, {

    start: function() {
        var self = this;
        return this._super().then(function() {
            self.render_dashboard();
        });
    },

    do_show: function(){
        this._super();
        this.update_cp();
    },

    on_update_options: function(ev){
        this.start_date = this.$searchview.find('input[name="start_date"]').val();
        this.end_date = this.$searchview.find('input[name="end_date"]').val();
        this.contract_ids = this.get_filtered_contract_ids();

        this.$el.empty();
        this.render_dashboard();
    },

    get_filtered_contract_ids: function(){
        var contract_inputs = this.$searchview.find("input:checkbox[name=contract_template_filter]:checked");
        return _.map(contract_inputs, function(el){return $(el).val()});
    },

    update_cp: function(){

        var self = this;

        if (!this.$searchview){
            this.$searchview = $(QWeb.render("account_contract_dashboard.dashboard_options", {
                start_date: this.start_date,
                end_date: this.end_date,
                contract_templates: this.contract_templates,
                contract_ids: this.contract_ids,
            }));

            this.$searchview.find('.o_update_options').on('click', self.on_update_options);

            // Check the box if it was already checked before the update
            this.$searchview.find("input[type='checkbox'][name='contract_template_filter']").each(function(){
                if (_.contains(self.contract_ids, $(this).attr('value'))) {
                    this.checked = true;
                }
            });

            this.set_up_datetimepickers();
        }

        this.update_control_panel({
            cp_content: {
                $searchview: this.$searchview,
            },
            breadcrumbs: this.action_manager.get_breadcrumbs(),
        });
    },

    set_up_datetimepickers: function(){
        this.$searchview.find('.datetime_picker').datetimepicker({
            format: 'YYYY-MM-DD',
            viewMode: 'years',
            pickTime: false,
        });

        var self = this;
        this.$searchview.find('.datetime_picker[name="start_date"]').on("dp.change", function (e) {
            self.$searchview.find('.datetime_picker[name="end_date"]').data("DateTimePicker").setMinDate(e.date);
        });
        this.$searchview.find('.datetime_picker[name="end_date"]').on("dp.change", function (e) {
            self.$searchview.find('.datetime_picker[name="start_date"]').data("DateTimePicker").setMaxDate(e.date);
        });
    },

});


// 1. Main dashboard
var account_contract_dashboard_main = account_contract_dashboard_abstract.extend({

    events: {
        'click .on_stat_box': 'on_stat_box',
        'click .on_forecast_box': 'on_forecast_box',
    },

    init: function(parent, context){
        this._super(parent);

        this.action_manager = parent;

        this.start_date = moment().subtract(1, 'M').format('YYYY-MM-DD');
        this.end_date = moment().format('YYYY-MM-DD');

        this.contract_ids = [];

        this.defs = [];
        this.unresolved_defs_vals = [];
    },

    willStart: function() {
        var self = this;
        return this._super().then(function() {
            return $.when(
                self.fetch_data(),
                self.fetch_contract_templates()
            );
        });
    },

    do_show: function(){
        this._super();

        var self = this;
        if (this.$main_dashboard){
            this.defs = [];

            // If there is unresolved defs, we need to replace the uncompleted boxes
            if (this.unresolved_defs_vals.length){
                var stat_boxes = this.$main_dashboard.find('.o_stat_box');
                _.each(this.unresolved_defs_vals, function(v, k){
                    self.defs.push(new account_contract_dashboard_stat_box(
                        self,
                        self.start_date, self.end_date,
                        self.contract_ids, self.currency,
                        self.stat_types,
                        stat_boxes[v].getAttribute("name"),
                        stat_boxes[v].getAttribute("code"),
                        self.currency
                    ).replace($(stat_boxes[v])));
                });
            }

        }
        else {
            this.render_dashboard();
        }
    },

    fetch_contract_templates: function(){
        var self = this;
        return new Model('account.analytic.account').query(['name']).filter([['type', '=', 'template']]).all()
            .done(function(result){
                self.contract_templates = result;
            });
    },

    fetch_data: function(){
        var self = this;
        return ajax.jsonRpc('/account_contract_dashboard/fetch_data', 'call', {
        }).done(function (result) {
            self.stat_types = result['stat_types'];
            self.forecast_stat_types = result['forecast_stat_types'];
            self.currency = result['currency_symbol'];
            self.currency_id = result['currency_id'];
        });
    },

    render_dashboard: function(){

        this.$main_dashboard = $(QWeb.render("account_contract_dashboard.dashboard", {
            stat_types: _.sortBy(_.values(this.stat_types), 'prior'),
            forecast_stat_types:  _.sortBy(_.values(this.forecast_stat_types), 'prior'),
            start_date: this.start_date,
            end_date: this.end_date,
            contract_templates: this.contract_templates,
        }));
        this.$el.append(this.$main_dashboard);

        var stat_boxes = this.$main_dashboard.find('.o_stat_box');
        var forecast_boxes = this.$main_dashboard.find('.o_forecast_box');

        for (var i=0; i < stat_boxes.length; i++) {
            this.defs.push(new account_contract_dashboard_stat_box(
                this,
                this.start_date, this.end_date,
                this.contract_ids, this.currency,
                this.stat_types,
                stat_boxes[i].getAttribute("name"),
                stat_boxes[i].getAttribute("code"),
                this.currency
            ).replace($(stat_boxes[i])));
        }

        for (var i=0; i < forecast_boxes.length; i++) {
            new account_contract_dashboard_forecast_box(
                this,
                this.end_date,
                this.forecast_stat_types,
                forecast_boxes[i].getAttribute("name"),
                forecast_boxes[i].getAttribute("code"),
                this.currency
            ).replace($(forecast_boxes[i]));
        }

        this.update_cp();
    },

    store_unresolved_defs: function(){
        this.unresolved_defs_vals = [];
        var self = this;
        _.each(this.defs, function(v, k){
            if (v && v.state() != "resolved"){
                self.unresolved_defs_vals.push(k);
            }
        })
    },

    on_stat_box: function(ev){
        ev.preventDefault();
        this.selected_stat = $(ev.currentTarget).attr('data-stat');

        this.store_unresolved_defs();

        var self = this;
        var options = {
            'stat_types': this.stat_types,
            'selected_stat': this.selected_stat,
            'start_date': this.start_date,
            'end_date': this.end_date,
            'contract_templates': this.contract_templates,
            'contract_ids': this.contract_ids,
            'currency': this.currency,
            'currency_id': this.currency_id,
        }

        new Model("ir.model.data")
            .call("xmlid_to_res_id", ["account_contract_dashboard.action_contract_dashboard_report_detailed"])
            .then(function(data) {
                self.action_manager.do_action(data, options);
            });
    },

    on_forecast_box: function(ev){
        ev.preventDefault();

        var self = this;
        var options = {
            'forecast_types': this.forecast_types,
            'start_date': this.start_date,
            'end_date': this.end_date,
            'contract_templates': this.contract_templates,
            'contract_ids': this.contract_ids,
            'currency': this.currency,
        }

        new Model("ir.model.data")
            .call("xmlid_to_res_id", ["account_contract_dashboard.action_contract_dashboard_report_forecast"])
            .then(function(data) {
                self.action_manager.do_action(data, options);
            });
    },
});


// 2. Detailed dashboard

var account_contract_dashboard_detailed = account_contract_dashboard_abstract.extend({

    events: {
        'click .o_mrr_detailed_analysis': 'on_mrr_detailed_analysis',
    },

    init: function(parent, context, options){
        this._super(parent);

        this.action_manager = parent;

        this.start_date = options['start_date'];
        this.end_date = options['end_date'];
        this.selected_stat = options['selected_stat'];
        this.stat_types = options['stat_types'];
        this.contract_templates = options['contract_templates'];
        this.contract_ids = options['contract_ids'];
        this.currency = options['currency'];
        this.currency_id = options['currency_id'];

        this.display_stats_by_plan = !_.contains(['nrr', 'arpu', 'logo_churn'], this.selected_stat);
        this.report_name = this.stat_types[this.selected_stat]['name'];
    },

    fetch_computed_stat: function(){

        var self = this;
        return ajax.jsonRpc('/account_contract_dashboard/compute_stat', 'call', {
            'stat_type': this.selected_stat,
            'start_date': this.start_date,
            'end_date': this.end_date,
            'contract_ids': this.contract_ids,
        }).done(function (result) {
            self.value = result;
        });
    },

    render_dashboard: function(){

        var self = this;
        $.when(
            this.fetch_computed_stat()
        ).done(function(){

            self.$el.append(QWeb.render("account_contract_dashboard.detailed_dashboard", {
                selected_stat_values: _.findWhere(self.stat_types, {code: self.selected_stat}),
                start_date: self.start_date,
                end_date: self.end_date,
                contract_templates: self.contract_templates,
                stat_type: self.selected_stat,
                currency: self.currency,
                report_name: self.report_name,
                value: self.value,
                display_stats_by_plan: self.display_stats_by_plan,
                formatNumber: utils.human_number,
            }));

            self.render_detailed_dashboard_stats_history();
            self.render_detailed_dashboard_graph();

            if (self.selected_stat === 'mrr') {
                self.render_detailed_dashboard_mrr_growth();
            }

            if (self.display_stats_by_plan){
                self.render_detailed_dashboard_stats_by_plan();
            }

            self.update_cp();
        });
    },

    render_detailed_dashboard_stats_history: function(){

        var self = this;
        ajax.jsonRpc('/account_contract_dashboard/get_stats_history', 'call', {
            'stat_type': this.selected_stat,
            'start_date': this.start_date,
            'end_date': this.end_date,
            'contract_ids': this.contract_ids,
        }).done(function (result) {
            // Rounding of result
            _.map(result, function(v, k, dict) {dict[k] = Math.round(v * 100) / 100;})
            var html = QWeb.render('account_contract_dashboard.stats_history', {
                stats_history: result,
                stat_type: self.selected_stat,
                stat_types: self.stat_types,
                currency: self.currency,
                rate: self.compute_rate,
                get_color_class: get_color_class,
                value: Math.round(self.value * 100) / 100,
            });
            self.$('#stat-history-box').append(html);
        });
        addLoader(this.$('.o_stats_by_plan'));
    },

    compute_rate: function(old_value, new_value){
        return old_value == 0 ? 0 : parseInt(100.0 * (new_value-old_value) / old_value);
    },

    render_detailed_dashboard_graph: function(){

        addLoader(this.$('#stat_chart_div'));

        var self = this;
        ajax.jsonRpc('/account_contract_dashboard/compute_graph_stat', 'call', {
            'stat_type': this.selected_stat,
            'start_date': this.start_date,
            'end_date': this.end_date,
            'points_limit': 0,
            'contract_ids': this.contract_ids,
        }).done(function(result){
            load_chart('#stat_chart_div', self.stat_types[self.selected_stat]['name'], result, true);
            self.$('#stat_chart_div div.o_loader').hide();
        });
    },

    render_detailed_dashboard_mrr_growth: function(){

        addLoader(this.$('#mrr_growth_chart_div'));
        var self = this;

        ajax.jsonRpc('/account_contract_dashboard/compute_graph_mrr_growth', 'call', {
            'start_date' : this.start_date,
            'end_date': this.end_date,
            'points_limit': 30,
            'contract_ids': this.contract_ids,
        }).done(function(result){
            self.load_chart_mrr_growth_stat('#mrr_growth_chart_div', result);
            self.$('#mrr_growth_chart_div div.o_loader').hide();
        });
    },

    on_mrr_detailed_analysis: function(ev){

        // This is a way to the backend ; we load another action (tree view of account.invoice.line)
        // To get the same numbers as in the dashboard, we need to give the filters to the backend
        var additional_context = {
            'search_default_asset_end_date': moment(this.end_date).toDate(),
            'search_default_asset_start_date': moment(this.end_date).toDate(),
            'search_default_currency_id': this.currency_id,
            // TODO: add contract_ids as another filter
        };

        var self = this;
        new Model("ir.model.data")
            .call("xmlid_to_res_id", ["account_contract_dashboard.action_invoice_line_entries_report"])
            .then(function(data) {
                self.action_manager.do_action(data, {additional_context: additional_context});
            });
    },

    load_chart_mrr_growth_stat: function(div_to_display, result){

        var data_chart = [
            {
                values: result['new_mrr'],
                key: 'New MRR',
                color: '#26b548',
            },
            {
                values: result['churned_mrr'],
                key: 'Churned MRR',
                color: '#df2e28',
            },
            {
                values: result['expansion_mrr'],
                key: 'Expansion MRR',
                color: '#fed049',
            },
            {
                values: result['down_mrr'],
                key: 'Down MRR',
                color: '#ffa500',
            },
            {
                values: result['net_new_mrr'],
                key: 'Net New MRR',
                color: '#2693d5',
            }
        ];

        var self = this;

        nv.addGraph(function() {
            var chart = nv.models.lineChart()
            .interpolate("monotone")
            .x(function(d) { return getDate(d); })
            .y(function(d) { return getValue(d); })
            .margin({left: 100})
            .useInteractiveGuideline(true)
            .transitionDuration(350)
            .showLegend(true)
            .showYAxis(true)
            .showXAxis(true);

            var tick_values = getPrunedTickValues(data_chart[0]['values'], 10);

            chart.xAxis
            .tickFormat(function(d) { return d3.time.format("%m/%d/%y")(new Date(d)); })
            .tickValues(_.map(tick_values, function(d) {return getDate(d); }))
            .rotateLabels(55);

            chart.yAxis
            .axisLabel('MRR ('+self.currency+')')
            .tickFormat(d3.format('.02f'));

            var svg = d3.select(div_to_display)
            .append("svg")
            .attr("height", '20em')
            svg
            .datum(data_chart)
            .call(chart);
            nv.utils.windowResize(chart.update);
            return chart;

        });
    },

    render_detailed_dashboard_stats_by_plan: function(){

        var self = this;
        ajax.jsonRpc('/account_contract_dashboard/get_stats_by_plan', 'call', {
            'stat_type': this.selected_stat,
            'start_date': this.start_date,
            'end_date': this.end_date,
            'contract_ids': this.contract_ids,
        }).done(function (result) {
            var html = QWeb.render('account_contract_dashboard.stats_by_plan', {
                'stats_by_plan': result,
                'stat_type': self.selected_stat,
                'stat_types': self.stat_types,
                'currency': self.currency,
                'value': self.value,
            });
            self.$('.o_stats_by_plan').replaceWith(html);
        });
        addLoader(this.$('.o_stats_by_plan'));
    },
});


// 3. Forecast dashboard

var account_contract_dashboard_forecast = account_contract_dashboard_abstract.extend({

    events: {
        'change .o_forecast_input': 'on_forecast_input',
        'change input.growth_type': 'on_growth_type_change',
    },

    init: function(parent, context, options){
        this._super(parent);

        this.action_manager = parent;
        this.start_date = options['start_date'];
        this.end_date = options['end_date'];
        this.contract_templates = options['contract_templates'];
        this.contract_ids = options['contract_ids'];
        this.currency = options['currency'];

        this.values = {};
    },

    willStart: function() {

        var self = this;
        return this._super().then(function() {
            return $.when(
                self.fetch_default_values_forecast('mrr'),
                self.fetch_default_values_forecast('contracts')
            );
        });
    },

    render_dashboard: function(){

        this.$el.append(QWeb.render("account_contract_dashboard.forecast", {
            start_date: this.start_date,
            end_date: this.end_date,
            contract_templates: this.contract_templates,
            values: this.values,
            currency: this.currency,
        }));

        this.values['mrr']['growth_type'] = 'linear';
        this.values['contracts']['growth_type'] = 'linear';
        this.reload_chart('mrr');
        this.reload_chart('contracts');

        this.update_cp();

        // The forecast widget does not need any searchview
        this.$searchview.empty();
    },

    on_forecast_input: function(ev){

        var forecast_type = $(ev.target).data()['forecast'];
        var data_type = $(ev.target).data()['type'];
        this.values[forecast_type][data_type] = parseInt($(ev.target).val());
        this.reload_chart(forecast_type);
    },

    on_growth_type_change: function(ev){

        var forecast_type = $(ev.target).data()['type'];

        this.values[forecast_type]['growth_type'] = this.$("input:radio[name=growth_type_"+forecast_type+"]:checked").val();
        if (this.values[forecast_type]['growth_type'] === 'linear') {
            this.$('#linear_growth_' + forecast_type).show();
            this.$('#expon_growth_' + forecast_type).hide();
        }
        else {
            this.$('#linear_growth_' + forecast_type).hide();
            this.$('#expon_growth_' + forecast_type).show();
        }
        this.reload_chart(forecast_type);
    },

    fetch_default_values_forecast: function(forecast_type){
        var self = this;
        return ajax.jsonRpc('/account_contract_dashboard/get_default_values_forecast', 'call', {
            'forecast_type': forecast_type
        }).done(function(result){
            self.values[forecast_type] = result;
        });
        addLoader(this.$('#forecast_chart_div_mrr, #forecast_chart_div_contracts'));
    },

    reload_chart: function(chart_type){
        var computed_values = compute_forecast_values(
            this.values[chart_type]['starting_value'],
            this.values[chart_type]['projection_time'],
            this.values[chart_type]['growth_type'],
            this.values[chart_type]['churn'],
            this.values[chart_type]['linear_growth'],
            this.values[chart_type]['expon_growth']
        );
        this.load_chart_forecast('#forecast_chart_div_' + chart_type, computed_values);

        var content = QWeb.render('account_contract_dashboard.forecast_summary_' + chart_type, {
            values: this.values[chart_type],
            computed_value: parseInt(computed_values[computed_values.length - 1][1]),
            currency: this.currency,
        });

        this.$('#forecast_summary_' + chart_type).replaceWith(content);
    },

    load_chart_forecast: function(div_to_display, values){

        this.$(div_to_display).empty();

        var data_chart = [
        {
            values: values,
            color: '#2693d5',
            area: true
        },
        ];
        nv.addGraph(function() {
            var chart = nv.models.lineChart()
            .interpolate("monotone")
            .x(function(d) { return getDate(d); })
            .y(function(d) { return getValue(d); });
            chart
            .margin({left: 100})
            .useInteractiveGuideline(true)
            .transitionDuration(350)
            .showLegend(false)
            .showYAxis(true)
            .showXAxis(true);

            var tick_values = getPrunedTickValues(data_chart[0]['values'], 10);

            chart.xAxis
            .tickFormat(function(d) { return d3.time.format("%m/%d/%y")(new Date(d)); })
            .tickValues(_.map(tick_values, function(d) { return getDate(d); }))
            .rotateLabels(55);

            chart.yAxis
            .tickFormat(d3.format('.02f'));

            var svg = d3.select(div_to_display)
            .append("svg");

            svg.attr("height", '20em');

            svg
            .datum(data_chart)
            .call(chart);
            nv.utils.windowResize(chart.update);
            return chart;
        });
    },
});

// These are two smalls widgets to display all the stat boxes in the main dashboard

var account_contract_dashboard_stat_box = Widget.extend({
    template: 'account_contract_dashboard.stat_box_content',

    init: function(parent, start_date, end_date, contract_ids, currency, stat_types, box_name, stat_type) {
        this._super(parent);

        this.start_date = start_date;
        this.end_date = end_date;

        this.contract_ids = contract_ids;
        this.currency = currency;
        this.stat_types = stat_types;
        this.box_name = box_name;
        this.stat_type = stat_type;

        this.chart_div_id = 'chart_div_' + this.stat_type;
        this.added_symbol = this.stat_types[this.stat_type]['add_symbol'] === 'currency' ? this.currency : this.stat_types[this.stat_type]['add_symbol'];
        this.formatNumber = utils.human_number;
    },

    willStart: function() {
        var self = this;
        return this._super().then(function() {
            return $.when(
                self.compute_graph(),
                self.compute_numbers()
            );
        });
    },

    start: function() {
        var self = this;
        return this._super().then(function() {
            load_chart('#'+self.chart_div_id, false, self.computed_graph, false);
        })
    },

    compute_graph: function(){

        var self = this;
        return ajax.jsonRpc('/account_contract_dashboard/compute_graph_stat', 'call', {
            'stat_type': this.stat_type,
            'start_date' : this.start_date,
            'end_date': this.end_date,
            'points_limit': 30,
            'contract_ids': this.contract_ids,
        }).done(function(result){
            self.computed_graph = result;
        });
    },

    compute_numbers: function(){

        var self = this;
        return ajax.jsonRpc('/account_contract_dashboard/compute_stat_trend', 'call', {
            'stat_type': this.stat_type,
            'start_date': this.start_date,
            'end_date': this.end_date,
            'contract_ids': this.contract_ids,
        }).done(function(result){
            self.value = result['value_2'];
            self.perc = result['perc'];
            self.color = get_color_class(result['perc'], self.stat_types[self.stat_type]['dir']);
        });
    },
});

var account_contract_dashboard_forecast_box = Widget.extend({
    template: 'account_contract_dashboard.forecast_stat_box_content',

    init: function(parent, end_date, forecast_stat_types, box_name, stat_type, currency) {
        this._super(parent);
        this.end_date = end_date;

        this.currency = currency;
        this.forecast_stat_types = forecast_stat_types;
        this.box_name = box_name;
        this.stat_type = stat_type;

        this.added_symbol = this.forecast_stat_types[this.stat_type]['add_symbol'] === 'currency' ? this.currency : this.forecast_stat_types[this.stat_type]['add_symbol'];
        this.chart_div_id = 'chart_div_' + this.stat_type;
        this.formatNumber = utils.human_number;
    },

    willStart: function() {
        var self = this;
        return this._super().then(function() {
            return $.when(
                self.compute_numbers()
            );
        });
    },

    start: function() {
        var self = this;
        return this._super().then(function() {
            load_chart('#'+self.chart_div_id, false, self.computed_graph, false);
        })
    },

    compute_numbers: function(){

        var self = this;
        return ajax.jsonRpc('/account_contract_dashboard/get_default_values_forecast', 'call', {
            'forecast_type': this.stat_type,
            'end_date': this.end_date,
        }).done(function(result){
            self.computed_graph = compute_forecast_values(
                result['starting_value'],
                result['projection_time'],
                'linear',
                result['churn'],
                result['linear_growth'],
                0
            );
            self.value = self.computed_graph[self.computed_graph.length - 1][1];
        });
    },
});

var account_contract_dashboard_salesman = Widget.extend(ControlPanelMixin, {

    init: function(parent, context){
        this._super(parent);

        this.action_manager = parent;

        this.period= moment().format('YYYY-MM');

        var self = this;
        $.when(
            this.fetch_salesmen()
        ).done(function(){
            self.render_dashboard();
        });
    },

    fetch_salesmen: function(){
        var self = this;
        return ajax.jsonRpc('/account_contract_dashboard/fetch_salesmen', 'call', {
        }).done(function (result) {
            self.salesman_ids = result['salesman_ids'];
            self.salesman = result['default_salesman'] || {};
            self.currency = result['currency'];
        });
    },

    render_dashboard: function(){

        this.$el.empty();
        this.$el.append(QWeb.render("account_contract_dashboard.salesman", {
            salesman_ids: this.salesman_ids,
            salesman: this.salesman,
            period: this.period,
        }));

        this.update_cp();

        if (!jQuery.isEmptyObject(this.salesman)) {
            this.render_dashboard_additionnal();
        }
    },

    render_dashboard_additionnal: function(){

        var self = this;

        addLoader(this.$('#mrr_growth_salesman'));

        ajax.jsonRpc('/account_contract_dashboard/get_values_salesman', 'call', {
            'period': this.period,
            'salesman_id': this.salesman['id'],
        }).done(function(result){
            load_chart_mrr_salesman('#mrr_growth_salesman', result);
            self.$('#mrr_growth_salesman div.o_loader').hide();

            // 1. Contracts modifcations

            var ICON_BY_TYPE = {
                'churn': 'o_red fa fa-remove',
                'new': 'o_green fa fa-plus',
                'down': 'o_red fa fa-arrow-down',
                'up': 'o_green fa fa-arrow-up',
            };

            _.each(result['contract_modifications'], function(v, k, list){
                v['class_type'] = ICON_BY_TYPE[v['type']];
            });

            var html_modifications = QWeb.render('account_contract_dashboard.contract_modifications', {
                modifications: result['contract_modifications'],
                get_str_diff: self.get_str_diff,
                get_color_class: get_color_class,
                currency: self.currency,
            });
            self.$('#contract_modifications').append(html_modifications);

            // 2. NRR invoices
            var html_nrr_invoices = QWeb.render('account_contract_dashboard.nrr_invoices', {
                invoices: result['nrr_invoices'],
                currency: self.currency,
            });
            self.$('#NRR_invoices').append(html_nrr_invoices);

            // 3. Summary
            var html_summary = QWeb.render('account_contract_dashboard.salesman_summary', {
                mrr: result['net_new'],
                nrr: result['nrr'],
                currency: self.currency
            });
            self.$('#mrr_growth_salesman').before(html_summary);
        });

        function load_chart_mrr_salesman(div_to_display, result){

            var data_chart = [{
                key: "MRR Growth",
                values: [
                    { 
                        "label" : "New MRR" ,
                        "value" : result['new']
                    } , 
                    { 
                        "label" : "Churned MRR" , 
                        "value" : result['churn']
                    } , 
                    { 
                        "label" : "Expansion MRR" , 
                        "value" : result['up']
                    } , 
                    { 
                        "label" : "Down MRR" , 
                        "value" : result['down']
                    } , 
                    { 
                        "label" : "Net New MRR" ,
                        "value" : result['net_new']
                    } , 
                    { 
                        "label" : "NRR" ,
                        "value" : result['nrr']
                    } ,
                ]
            }];

            nv.addGraph(function() {
                var chart = nv.models.discreteBarChart()
                    .x(function(d) { return d.label })
                    .y(function(d) { return d.value })
                    .staggerLabels(true)
                    .tooltips(false)
                    .showValues(true)
                    .transitionDuration(350);

                var svg = d3.select(div_to_display)
                    .append("svg")
                    .attr("height", '20em')
                svg
                    .datum(data_chart)
                    .call(chart);

                nv.utils.windowResize(chart.update);

                return chart;
            });
        }
    },

    get_str_diff: function(diff){
        return diff < 0 ? diff.toString() : '+' + diff.toString();
    },

    on_update_options: function(ev){
        this.period = this.$searchview.find('input[name="period"]').val();
        var selected_salesman_id = Number(this.$searchview.find('option[name="salesman"]:selected').val());
        this.salesman = _.findWhere(this.salesman_ids, {id: selected_salesman_id});
        this.render_dashboard();
    },

    set_up_datetimepickers: function(){
        this.$searchview.find('.datetime_picker').datetimepicker({
            format: 'YYYY-MM',
            viewMode: 'years',
            pickTime: false,
        });
    },

    update_cp: function(){

        this.$searchview = $(QWeb.render("account_contract_dashboard.salesman_searchview", {
            period: this.period,
            salesman_ids: this.salesman_ids,
            salesman: this.salesman,
        }));


        var self = this;
        this.$searchview.find('.o_update_options').on('click', self.on_update_options);

        this.set_up_datetimepickers();

        this.update_control_panel({
            cp_content: {
                $searchview: this.$searchview,
            },
            breadcrumbs: this.action_manager.get_breadcrumbs(),
        });
    },
});


// Utility functions

function addLoader(selector){
    var loader = '<i class="fa fa-spin fa-spinner fa-pulse"></i>';
    selector.html("<div class='o_loader'>" + loader + "</div>");
}

function getMinY(l) {
    var min = Math.min.apply(Math,l.map(function(o){return o[1];}));
    var max = Math.max.apply(Math,l.map(function(o){return o[1];}));
    return Math.max(0, min - (max-min)/2);
}
function getDate(d) { return new Date(d[0]); }
function getValue(d) { return d[1]; }
function getPrunedTickValues(ticks, nb_desired_ticks) {
    var nb_values = ticks.length;
    var keep_one_of = Math.max(1, Math.floor(nb_values / nb_desired_ticks));

    return _.filter(ticks, function(d, i) {
        return i % keep_one_of === 0;
    });
}

function compute_forecast_values(starting_value, projection_time, growth_type, churn, linear_growth, expon_growth) {
    var values = [];
    var now = moment();
    var cur_value = starting_value;

    for(var i = 1; i <= projection_time ; i++) {
        var cur_date = moment().add(i, 'months');
        if (growth_type === 'linear') {
            cur_value = cur_value*(1-churn/100) + linear_growth;
        }
        else {
            cur_value = cur_value*(1-churn/100)*(1+expon_growth/100);
        }
        values.push({
            '0': cur_date.format('L'),
            '1': cur_value,
        });
    }
    return values;
}

function load_chart(div_to_display, key_name, result, show_legend){

    var data_chart = [
    {
        values: result,
        key: key_name,
        color: '#2693d5',
        area: true
    },
    ];
    nv.addGraph(function() {
        var chart = nv.models.lineChart()
        .interpolate("monotone")
        .forceY([getMinY(result)])
        .x(function(d) { return getDate(d); })
        .y(function(d) { return getValue(d); });
        if (show_legend){
            chart
            .margin({left: 100})
            .useInteractiveGuideline(true)
            .transitionDuration(350)
            .showLegend(true)
            .showYAxis(true)
            .showXAxis(true);
        }
        else {
            chart
            .margin({left: 0, top: 0, bottom: 0, right: 0})
            .useInteractiveGuideline(false)
            .transitionDuration(350)
            .showLegend(false)
            .showYAxis(false)
            .showXAxis(false)
            .interactive(false);
        }

        var tick_values = getPrunedTickValues(data_chart[0]['values'], 10);
        chart.xAxis
        .tickFormat(function(d) { return d3.time.format("%m/%d/%y")(new Date(d)); })
        .tickValues(_.map(tick_values, function(d) { return getDate(d); }))
        .rotateLabels(55);

        chart.yAxis
        .axisLabel(key_name)
        .tickFormat(d3.format('.02f'));

        var svg = d3.select(div_to_display)
        .append("svg");
        if (show_legend){
            svg.attr("height", '20em');
        }
        svg
        .datum(data_chart)
        .call(chart);

        nv.utils.windowResize(chart.update);
        return chart;
    });
}

function get_color_class(value, direction){
    var color = 'o_black';

    if (value != 0 && direction === 'up'){
        color = (value > 0) && 'o_green' || 'o_red';
    }
    if (value != 0 && direction != 'up'){
        color = (value < 0) && 'o_green' || 'o_red';
    }

    return color
}

// Add client actions

core.action_registry.add('account_contract_dashboard_main', account_contract_dashboard_main);
core.action_registry.add('account_contract_dashboard_detailed', account_contract_dashboard_detailed);
core.action_registry.add('account_contract_dashboard_forecast', account_contract_dashboard_forecast);
core.action_registry.add('account_contract_dashboard_salesman', account_contract_dashboard_salesman);

});