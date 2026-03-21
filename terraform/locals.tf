locals {
  default_registry_base = "${var.artifact_location}-docker.pkg.dev/${var.project_id}/${var.artifact_repository}/${var.artifact_image_name}"
  registry_base         = trimspace(var.registry_image_base) != "" ? var.registry_image_base : local.default_registry_base
  # 完全な image:tag を直指定するか、レジストリベース + タグで組み立てる
  docker_image = trimspace(var.docker_image) != "" ? var.docker_image : "${local.registry_base}:${var.image_tag}"
}
