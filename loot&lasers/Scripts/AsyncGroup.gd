class_name AsyncGroup
extends RefCounted
## Runs independent callables concurrently and resolves when every task finishes.

signal completed

var _remaining: int = 0
var _results: Array = []


func add(task: Callable) -> void:
	assert(task.is_valid(), "AsyncGroup requires a valid callable")
	var result_index := _results.size()
	_results.append(null)
	_remaining += 1
	_run_task(result_index, task)


func wait() -> Array:
	if _remaining > 0:
		await completed
	return _results


func _run_task(result_index: int, task: Callable) -> void:
	_results[result_index] = await task.call()
	_remaining -= 1
	if _remaining == 0:
		completed.emit()
