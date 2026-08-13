-- Prefer storing polar as donut + display_config.polarArea in the app until
-- this constraint is applied. Safe to run anytime to allow native widget_type=polar.

alter table public.dashboard_widgets
  drop constraint if exists dashboard_widgets_widget_type_check;

alter table public.dashboard_widgets
  add constraint dashboard_widgets_widget_type_check
  check (widget_type in (
    'kpi',
    'bar',
    'line',
    'pie',
    'donut',
    'polar',
    'gauge',
    'table'
  ));
